/**
 * One-shot backfill for vault_flow_event on the current vault deployment.
 * Reads PendingRequestProcessed + EmergencyWithdrawal events from chain.
 *
 * Why: no indexer writes to this table today. The rows that exist predate the
 * current vault redeployment (2026-03-25, block 3890223). Running this lets
 * analytics queries (airdrop gains, cumulative flows) reflect reality.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts --chainId 5064014
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts --dry-run
 *
 * --dry-run prints what would be upserted without touching the database. Use it to
 * verify event discovery and data shape before running with write credentials.
 */
import { parseAbiItem } from 'viem';
import prisma from '../src/db';
import { getProviderForChain } from '../src/utils/utils';
import { contracts } from '@sapience/sdk/contracts';

const CHAIN_ID = (() => {
  const eq = process.argv.find((a) => a.startsWith('--chainId='));
  if (eq) return Number(eq.split('=')[1]);
  const idx = process.argv.indexOf('--chainId');
  if (idx > 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]);
  return 5064014;
})();

const DRY_RUN = process.argv.includes('--dry-run');

const BATCH_BLOCKS = 10_000n;

const processedEvent = parseAbiItem(
  'event PendingRequestProcessed(address indexed user, bool direction, uint256 shares, uint256 assets)'
);
const emergencyEvent = parseAbiItem(
  'event EmergencyWithdrawal(address indexed user, uint256 shares, uint256 assets)'
);

async function main() {
  const vaultEntry = contracts.predictionMarketVault[CHAIN_ID];
  if (!vaultEntry) throw new Error(`No vault configured for chain ${CHAIN_ID}`);

  const vaultAddress = vaultEntry.address as `0x${string}`;
  const fromBlock = BigInt(vaultEntry.blockCreated);
  const client = getProviderForChain(CHAIN_ID);
  const toBlock = await client.getBlockNumber();

  console.log(
    `[backfillVaultFlows] chain=${CHAIN_ID} vault=${vaultAddress} blocks=${fromBlock}..${toBlock}${DRY_RUN ? ' [DRY RUN]' : ''}`
  );

  let upserted = 0;
  const previewRows: Array<{
    block: number;
    ts: string;
    type: string;
    user: string;
    assets: string;
    shares: string;
  }> = [];
  for (let start = fromBlock; start <= toBlock; start += BATCH_BLOCKS) {
    const end = start + BATCH_BLOCKS - 1n > toBlock ? toBlock : start + BATCH_BLOCKS - 1n;

    const [processedLogs, emergencyLogs] = await Promise.all([
      client.getLogs({
        address: vaultAddress,
        event: processedEvent,
        fromBlock: start,
        toBlock: end,
      }),
      client.getLogs({
        address: vaultAddress,
        event: emergencyEvent,
        fromBlock: start,
        toBlock: end,
      }),
    ]);

    const blockTimestamps = new Map<bigint, number>();
    const uniqueBlocks = new Set<bigint>([
      ...processedLogs.map((l) => l.blockNumber!),
      ...emergencyLogs.map((l) => l.blockNumber!),
    ]);
    for (const bn of uniqueBlocks) {
      const b = await client.getBlock({ blockNumber: bn });
      blockTimestamps.set(bn, Number(b.timestamp));
    }

    for (const log of processedLogs) {
      const { user, direction, shares, assets } = log.args;
      if (!user || !shares || !assets || log.logIndex == null) continue;
      const ts = blockTimestamps.get(log.blockNumber!)!;
      const row = {
        chainId: CHAIN_ID,
        blockNumber: Number(log.blockNumber!),
        transactionHash: log.transactionHash!,
        timestamp: ts,
        logIndex: log.logIndex,
        eventType: direction ? 'deposit' : 'withdrawal',
        user: user.toLowerCase(),
        assets: assets.toString(),
        shares: shares.toString(),
      };
      if (DRY_RUN) {
        previewRows.push({
          block: row.blockNumber,
          ts: new Date(ts * 1000).toISOString(),
          type: row.eventType,
          user: row.user,
          assets: (Number(row.assets) / 1e18).toFixed(4),
          shares: (Number(row.shares) / 1e18).toFixed(4),
        });
      } else {
        await prisma.vaultFlowEvent.upsert({
          where: {
            chainId_transactionHash_logIndex: {
              chainId: row.chainId,
              transactionHash: row.transactionHash,
              logIndex: row.logIndex,
            },
          },
          create: row,
          update: {},
        });
      }
      upserted++;
    }

    for (const log of emergencyLogs) {
      const { user, shares, assets } = log.args;
      if (!user || !shares || !assets || log.logIndex == null) continue;
      const ts = blockTimestamps.get(log.blockNumber!)!;
      const row = {
        chainId: CHAIN_ID,
        blockNumber: Number(log.blockNumber!),
        transactionHash: log.transactionHash!,
        timestamp: ts,
        logIndex: log.logIndex,
        eventType: 'withdrawal',
        user: user.toLowerCase(),
        assets: assets.toString(),
        shares: shares.toString(),
      };
      if (DRY_RUN) {
        previewRows.push({
          block: row.blockNumber,
          ts: new Date(ts * 1000).toISOString(),
          type: 'emergency_withdrawal',
          user: row.user,
          assets: (Number(row.assets) / 1e18).toFixed(4),
          shares: (Number(row.shares) / 1e18).toFixed(4),
        });
      } else {
        await prisma.vaultFlowEvent.upsert({
          where: {
            chainId_transactionHash_logIndex: {
              chainId: row.chainId,
              transactionHash: row.transactionHash,
              logIndex: row.logIndex,
            },
          },
          create: row,
          update: {},
        });
      }
      upserted++;
    }

    if (processedLogs.length || emergencyLogs.length) {
      console.log(
        `  block ${start}..${end}: +${processedLogs.length} processed, +${emergencyLogs.length} emergency`
      );
    }
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would upsert ${upserted} vault flow rows:`);
    console.table(previewRows);
  } else {
    console.log(`\nDone. Upserted ${upserted} vault flow rows.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
