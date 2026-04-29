/**
 * One-shot backfill for vault_flow_event. Reads PendingRequestProcessed +
 * EmergencyWithdrawal events from chain for every configured vault (main,
 * Pyth options, single-leg) and writes rows tagged with the source vault.
 *
 * Why: no cron writes to this table today; it is regenerated manually after
 * schema changes or vault redeployments. Downstream consumers
 * (protocol_stats_snapshot, airdrop gains, cumulative flows) re-derive from
 * these events.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts --chainId 5064014
 *   pnpm --filter @sapience/api exec tsx scripts/backfillVaultFlows.ts --dry-run
 *
 * --dry-run prints what would be upserted without touching the database.
 */
import { parseAbiItem } from 'viem';
import prisma from '../src/db';
import { getProviderForChain } from '../src/utils/utils';
import { getConfiguredVaults } from '../src/helpers/protocolStats';

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

interface PreviewRow {
  vault: string;
  block: number;
  ts: string;
  type: string;
  user: string;
  assets: string;
  shares: string;
}

async function backfillVault(
  chainId: number,
  kind: string,
  address: string,
  fromBlock: bigint,
  toBlock: bigint,
  previewRows: PreviewRow[]
): Promise<number> {
  const client = getProviderForChain(chainId);
  const vaultAddress = address as `0x${string}`;
  const vaultAddressLower = address.toLowerCase();

  console.log(
    `\n[backfillVaultFlows] ${kind} vault ${vaultAddress} blocks=${fromBlock}..${toBlock}${DRY_RUN ? ' [DRY RUN]' : ''}`
  );

  let upserted = 0;

  for (let start = fromBlock; start <= toBlock; start += BATCH_BLOCKS) {
    const end =
      start + BATCH_BLOCKS - 1n > toBlock ? toBlock : start + BATCH_BLOCKS - 1n;

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
        chainId,
        vaultAddress: vaultAddressLower,
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
          vault: kind,
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
          update: { vaultAddress: vaultAddressLower },
        });
      }
      upserted++;
    }

    for (const log of emergencyLogs) {
      const { user, shares, assets } = log.args;
      if (!user || !shares || !assets || log.logIndex == null) continue;
      const ts = blockTimestamps.get(log.blockNumber!)!;
      const row = {
        chainId,
        vaultAddress: vaultAddressLower,
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
          vault: kind,
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
          update: { vaultAddress: vaultAddressLower },
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

  return upserted;
}

async function main() {
  const vaults = getConfiguredVaults(CHAIN_ID);
  if (vaults.length === 0) {
    throw new Error(`No vaults configured for chain ${CHAIN_ID}`);
  }

  const client = getProviderForChain(CHAIN_ID);
  const toBlock = await client.getBlockNumber();

  const previewRows: PreviewRow[] = [];
  let totalUpserted = 0;
  for (const vault of vaults) {
    const fromBlock = BigInt(vault.config.blockCreated);
    totalUpserted += await backfillVault(
      CHAIN_ID,
      vault.kind,
      vault.address,
      fromBlock,
      toBlock,
      previewRows
    );
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would upsert ${totalUpserted} vault flow rows:`);
    console.table(previewRows);
  } else {
    console.log(`\nDone. Upserted ${totalUpserted} vault flow rows.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
