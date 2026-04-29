/**
 * One-shot cleanup that follows the migration which adds Claim.logIndex.
 *
 * Re-reads on-chain TokensRedeemed events from the prediction-market escrow
 * (current + every legacy deployment) and reconciles each event against the
 * Claim table. Three cases per event:
 *
 *   (a) Placeholder Claim row exists (logIndex < 0 from the migration).
 *       UPDATE it to the real on-chain logIndex.
 *   (b) Real Claim row exists (live indexer wrote it correctly). No-op,
 *       except: drop any stale placeholder for the same on-chain event.
 *   (c) No Claim row anywhere — crash-in-the-middle victim from before the
 *       dispatcher reorder. INSERT the row from on-chain data.
 *
 * After this script runs, the DB matches canonical chain state regardless of
 * how each row got there (live indexer success, replay, or recovered crash).
 *
 * Idempotent: only matches placeholder rows (logIndex < 0) or missing rows;
 * re-running after a successful pass is a no-op. Verifying completion:
 *
 *   SELECT COUNT(*) FROM "Claim" WHERE "logIndex" < 0;   -- should be 0
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/backfillClaimLogIndex.ts
 *   pnpm --filter @sapience/api exec tsx scripts/backfillClaimLogIndex.ts --chainId 5064014
 */
import { parseAbiItem, type Block as ViemBlock } from 'viem';
import prisma from '../src/db';
import { getProviderForChain } from '../src/utils/utils';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';

const CHAIN_ID = (() => {
  const eq = process.argv.find((a) => a.startsWith('--chainId='));
  if (eq) return Number(eq.split('=')[1]);
  const idx = process.argv.indexOf('--chainId');
  if (idx > 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return 5064014;
})();

const BATCH_BLOCKS = 10_000n;
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

const tokensRedeemedEvent = parseAbiItem(
  'event TokensRedeemed(bytes32 indexed pickConfigId, address indexed holder, address indexed positionToken, uint256 tokensBurned, uint256 collateralPaid, bytes32 refCode)'
);

interface Counters {
  placeholdersUpdated: number;
  placeholdersDroppedDueToConflict: number;
  missingRowsInserted: number;
  realRowsConfirmed: number;
}

async function reconcileEscrow(
  chainId: number,
  client: ReturnType<typeof getProviderForChain>,
  escrowAddress: string,
  fromBlock: bigint,
  toBlock: bigint,
  counters: Counters
): Promise<void> {
  console.log(
    `\n[backfillClaimLogIndex] chain=${chainId} escrow=${escrowAddress} blocks=${fromBlock}..${toBlock}`
  );

  // Block-timestamp cache so case (c) inserts can use the real on-chain
  // timestamp without an RPC call per missing row.
  const blockCache = new Map<bigint, number>();
  const getBlockTs = async (bn: bigint): Promise<number> => {
    if (blockCache.has(bn)) return blockCache.get(bn)!;
    const blk: ViemBlock = await client.getBlock({ blockNumber: bn });
    const ts = Number(blk.timestamp);
    blockCache.set(bn, ts);
    return ts;
  };

  for (let start = fromBlock; start <= toBlock; start += BATCH_BLOCKS) {
    const end =
      start + BATCH_BLOCKS - 1n > toBlock ? toBlock : start + BATCH_BLOCKS - 1n;

    const logs = await client.getLogs({
      address: escrowAddress as `0x${string}`,
      event: tokensRedeemedEvent,
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      const txHash = log.transactionHash;
      const realLogIdx = log.logIndex;
      const blockNumber = log.blockNumber;
      if (
        txHash == null ||
        realLogIdx == null ||
        blockNumber == null ||
        log.args.pickConfigId == null ||
        log.args.holder == null ||
        log.args.positionToken == null ||
        log.args.tokensBurned == null ||
        log.args.collateralPaid == null ||
        log.args.refCode == null
      ) {
        continue;
      }

      const pickConfigId = log.args.pickConfigId.toLowerCase();
      const holder = log.args.holder.toLowerCase();
      const positionToken = log.args.positionToken.toLowerCase();
      const tokensBurned = log.args.tokensBurned.toString();
      const collateralPaid = log.args.collateralPaid.toString();
      const refCode = log.args.refCode;

      // Case (b): real row already exists — drop any stale placeholder.
      const realRow = await prisma.claim.findFirst({
        where: { chainId, txHash, logIndex: realLogIdx },
      });
      if (realRow) {
        const dropped = await prisma.claim.deleteMany({
          where: {
            chainId,
            txHash,
            holder,
            positionToken,
            tokensBurned,
            logIndex: { lt: 0 },
          },
        });
        counters.realRowsConfirmed += 1;
        counters.placeholdersDroppedDueToConflict += dropped.count;
        continue;
      }

      // Case (a): placeholder row exists — swap to the real logIndex.
      const placeholder = await prisma.claim.findFirst({
        where: {
          chainId,
          txHash,
          holder,
          positionToken,
          tokensBurned,
          logIndex: { lt: 0 },
        },
        orderBy: { id: 'asc' },
      });
      if (placeholder) {
        await prisma.claim.update({
          where: { id: placeholder.id },
          data: { logIndex: realLogIdx },
        });
        counters.placeholdersUpdated += 1;
        continue;
      }

      // Case (c): no Claim row anywhere — crash-in-the-middle recovery.
      const redeemedAt = await getBlockTs(blockNumber);
      await prisma.claim.create({
        data: {
          chainId,
          marketAddress: escrowAddress.toLowerCase(),
          predictionId: pickConfigId,
          holder,
          positionToken,
          tokensBurned,
          collateralPaid,
          redeemedAt,
          txHash,
          logIndex: realLogIdx,
          refCode: refCode !== ZERO_BYTES32 ? refCode : null,
        },
      });
      counters.missingRowsInserted += 1;
    }
  }
}

async function main(): Promise<void> {
  const escrowConfig = contracts.predictionMarketEscrow[CHAIN_ID];
  if (!escrowConfig) {
    throw new Error(`No predictionMarketEscrow configured for chain ${CHAIN_ID}`);
  }

  const client = getProviderForChain(CHAIN_ID);
  const head = await client.getBlockNumber();

  // Reconcile across primary + every legacy escrow deployment so claims that
  // reference legacy addresses still get backfilled.
  const escrows: Array<{ address: string; blockCreated: number }> = [
    {
      address: escrowConfig.address,
      blockCreated: escrowConfig.blockCreated,
    },
    ...(escrowConfig.legacy ?? []).map((le) => normalizeLegacyEntry(le)),
  ];

  const counters: Counters = {
    placeholdersUpdated: 0,
    placeholdersDroppedDueToConflict: 0,
    missingRowsInserted: 0,
    realRowsConfirmed: 0,
  };

  for (const e of escrows) {
    await reconcileEscrow(
      CHAIN_ID,
      client,
      e.address,
      BigInt(e.blockCreated),
      head,
      counters
    );
  }

  // Final sanity check.
  const remainingPlaceholders = await prisma.claim.count({
    where: { chainId: CHAIN_ID, logIndex: { lt: 0 } },
  });

  console.log(`\n[backfillClaimLogIndex] done — chain=${CHAIN_ID}`);
  console.log(`  placeholders updated to real logIndex: ${counters.placeholdersUpdated}`);
  console.log(`  placeholders dropped (real row already existed): ${counters.placeholdersDroppedDueToConflict}`);
  console.log(`  missing rows inserted (crash recovery): ${counters.missingRowsInserted}`);
  console.log(`  real rows confirmed (no-op): ${counters.realRowsConfirmed}`);
  console.log(`  placeholders still in DB: ${remainingPlaceholders}`);

  if (remainingPlaceholders > 0) {
    console.warn(
      `\n[backfillClaimLogIndex] WARN: ${remainingPlaceholders} placeholder Claim rows remain after this pass — they have no matching on-chain event in the scanned range. Inspect manually:\n` +
        `  SELECT * FROM "Claim" WHERE "chainId"=${CHAIN_ID} AND "logIndex" < 0;`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
