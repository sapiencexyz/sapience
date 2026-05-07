/**
 * One-shot recovery for `Prediction` rows that the live indexer wrote `Event`
 * rows for but never followed through with a `Picks` / `Prediction` insert.
 *
 * Background: the prod indexer's dispatcher used to write the `Event` row
 * BEFORE running the handler ("Event-first" pattern). When the handler
 * crashed mid-flight (transient RPC error, transaction rollback, etc.) the
 * `Event` row remained, and every subsequent reconciler pass short-circuited
 * via the `event.findUnique` pre-flight check — leaving the position-side
 * data permanently missing.
 *
 * This script:
 *   1. Deletes the orphaned `Event` rows for the supplied tx hashes.
 *   2. Fetches the on-chain logs for each tx.
 *   3. Re-dispatches them through the indexer's `processLog`, which now runs
 *      the handler FIRST and only writes the `Event` row on success (per the
 *      reorder shipped in this branch). All derived state — `Picks`,
 *      `Prediction`, `Position` balances, open-interest counts — gets
 *      recreated correctly.
 *
 * Read-only on the chain side; writes to DB.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/recoverMissingPredictions.ts
 *   pnpm --filter @sapience/api exec tsx scripts/recoverMissingPredictions.ts --tx 0xabc...,0xdef...
 *   pnpm --filter @sapience/api exec tsx scripts/recoverMissingPredictions.ts --chainId 5064014
 */
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import type { Block, Log } from 'viem';
import prisma from '../src/core/db';
import { getProviderForChain } from '../src/lib/utils';
import PredictionMarketEscrowIndexer from '../src/workers/indexers/predictionMarketEscrowIndexer';

const DEFAULT_TXS_5064014 = [
  '0x3617d01b5e9cc4967498848ac755d6b618ed271075bc8798ada27302fb675a71',
  '0x15f593612aa7dcfc0f2f107c47661c1aee1ee959ecb0e3c6bb8c20f37e31514d',
  '0xff2f40cd861d5d9a56064f71f5cd546e342fb4ba6d066a4e7907a375f12f00fa',
  '0x0ce5ffd2e4f79b588c1ad7da1edbfac9b40a4de247c4ffc843679ec198f6bab7',
];

function parseFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(name);
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main(): Promise<void> {
  const chainId = Number(parseFlag('--chainId') ?? '5064014');
  const txArg = parseFlag('--tx');
  const txs = (txArg ? txArg.split(',') : DEFAULT_TXS_5064014).map((t) =>
    t.toLowerCase()
  );

  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  if (!escrowConfig) {
    throw new Error(`No predictionMarketEscrow configured for chain ${chainId}`);
  }

  const client = getProviderForChain(chainId);

  // Build a per-escrow indexer cache. When dispatching a log we pick the
  // indexer instance whose contractAddress matches `log.address`, because
  // the handlers' `getPrediction(predictionId)` RPC call only succeeds
  // against the escrow that originally minted the prediction. Using the
  // current escrow for a legacy-minted prediction returns `0x` and forces
  // the handler down its "RPC failed → create Prediction without
  // pickConfigId" fallback path, leaving Picks missing.
  type EscrowEntry = { address: string; isLegacy: boolean; blockCreated: number };
  const escrows: EscrowEntry[] = [
    {
      address: escrowConfig.address.toLowerCase(),
      isLegacy: false,
      blockCreated: escrowConfig.blockCreated ?? 0,
    },
    ...(escrowConfig.legacy ?? []).map((le) => {
      const norm = normalizeLegacyEntry(le);
      return {
        address: norm.address.toLowerCase(),
        isLegacy: true,
        blockCreated: norm.blockCreated,
      };
    }),
  ];
  const indexerByAddr = new Map<
    string,
    (log: Log, block: Block) => Promise<void>
  >();
  for (const e of escrows) {
    const ix = new PredictionMarketEscrowIndexer(
      chainId,
      e.address as `0x${string}`,
      e.isLegacy,
      e.blockCreated
    );
    const dispatch = (
      ix as unknown as {
        processLog: (log: Log, block: Block) => Promise<void>;
      }
    ).processLog.bind(ix);
    indexerByAddr.set(e.address, dispatch);
  }

  console.log(
    `[recover] chainId=${chainId}  txs=${txs.length}  escrows=${escrows.length} (1 primary + ${escrows.length - 1} legacy)`
  );

  for (const tx of txs) {
    console.log(`\n── ${tx} ──`);

    // 1. Snapshot existing Event rows for this tx so we can confirm what was deleted.
    const eventsBefore = await prisma.event.findMany({
      where: { transactionHash: tx },
      select: { logIndex: true, logData: true },
      orderBy: { logIndex: 'asc' },
    });
    console.log(
      `  Event rows before: ${eventsBefore
        .map((e) => `${(e.logData as { eventName?: string }).eventName}@${e.logIndex}`)
        .join(', ')}`
    );

    // 2. Delete them so the dispatcher's pre-flight findUnique doesn't short-circuit.
    const deleted = await prisma.event.deleteMany({
      where: { transactionHash: tx },
    });
    console.log(`  Deleted ${deleted.count} Event rows`);

    // 3. Fetch the tx receipt to get block number + log indices.
    const receipt = await client.getTransactionReceipt({
      hash: tx as `0x${string}`,
    });
    const blockNumber = receipt.blockNumber;
    const block = await client.getBlock({ blockNumber });

    // 4. Filter to logs emitted by the (current OR legacy) escrow contract.
    const escrowAddrs = new Set<string>([
      escrowConfig.address.toLowerCase(),
      ...(escrowConfig.legacy ?? []).map((le) =>
        (typeof le === 'string' ? le : le.address).toLowerCase()
      ),
    ]);
    const escrowLogs = receipt.logs.filter((l) =>
      escrowAddrs.has(l.address.toLowerCase())
    );
    console.log(
      `  Block ${blockNumber}: ${receipt.logs.length} total logs, ${escrowLogs.length} from escrow`
    );

    // 5. Re-dispatch each escrow log through the indexer instance whose
    //    contractAddress matches the log's emitter — see comment above the
    //    indexer cache for why per-escrow dispatch is required.
    for (const log of escrowLogs) {
      const emitter = log.address.toLowerCase();
      const dispatch = indexerByAddr.get(emitter);
      if (!dispatch) {
        console.log(
          `    ✗ no indexer registered for emitter=${emitter} — skipping logIndex=${log.logIndex}`
        );
        continue;
      }
      console.log(
        `    → processLog logIndex=${log.logIndex}  emitter=${emitter.slice(0, 10)}…  topics0=${log.topics[0]?.slice(0, 14)}…`
      );
      await dispatch(log, block);
    }

    // 6. Verify Picks + Prediction now exist.
    const eventsAfter = await prisma.event.findMany({
      where: { transactionHash: tx },
      select: { logIndex: true, logData: true },
      orderBy: { logIndex: 'asc' },
    });
    const predEvent = eventsAfter.find(
      (e) =>
        (e.logData as { eventName?: string }).eventName === 'PredictionCreated'
    );
    const predId = (
      predEvent?.logData as
        | { args?: { predictionId?: string } }
        | undefined
    )?.args?.predictionId?.toLowerCase();

    if (predId) {
      const prediction = await prisma.prediction.findUnique({
        where: { predictionId: predId },
        select: {
          predictionId: true,
          predictor: true,
          counterparty: true,
          predictorCollateral: true,
          counterpartyCollateral: true,
          pickConfigId: true,
          collateralDeposited: true,
        },
      });
      const picks = prediction?.pickConfigId
        ? await prisma.picks.findUnique({
            where: { id: prediction.pickConfigId },
            select: { id: true, predictorToken: true },
          })
        : null;

      console.log(
        `  Prediction: ${prediction ? `RECREATED (predictor=${prediction.predictor}, cpColl=${prediction.counterpartyCollateral}, deposited=${prediction.collateralDeposited})` : 'STILL MISSING'}`
      );
      console.log(
        `  Picks: ${picks ? `RECREATED id=${picks.id.slice(0, 14)}…` : 'STILL MISSING (Prediction may have null pickConfigId)'}`
      );
    }
  }

  console.log('\n[recover] done');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
