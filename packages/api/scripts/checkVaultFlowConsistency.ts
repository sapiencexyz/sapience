/**
 * Read-only diagnostic. Cross-checks on-chain PendingRequestProcessed +
 * EmergencyWithdrawal events for one configured vault against `vault_flow_event`
 * rows in the local DB. Exists to confirm or refute hypotheses like
 * "the indexer is behind chain head and `calculateVaultFlows` is reporting
 * stale withdrawal totals."
 *
 * Writes nothing. Pretty-prints:
 *   - Per-event diff (chain vs DB) keyed by (transactionHash, logIndex).
 *   - Cumulative deposits/withdrawals on-chain vs DB up to --toTs.
 *   - The implied gap, in USDe.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultFlowConsistency.ts
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultFlowConsistency.ts --chainId 5064014
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultFlowConsistency.ts --vaultAddress 0x1f5f...
 *   pnpm --filter @sapience/api exec tsx scripts/checkVaultFlowConsistency.ts --fromTs 1777305600 --toTs 1777320000
 *
 * Defaults: chainId=5064014 (mainnet), protocol vault primary, last 7 days
 * floored to 4h.
 */
import { formatUnits, parseAbiItem } from 'viem';
import prisma from '../src/db';
import { getBlockByTimestamp, getProviderForChain } from '../src/utils/utils';
import { getConfiguredVaults } from '../src/helpers/protocolStats';

const processedEvent = parseAbiItem(
  'event PendingRequestProcessed(address indexed user, bool direction, uint256 shares, uint256 assets)'
);
const emergencyEvent = parseAbiItem(
  'event EmergencyWithdrawal(address indexed user, uint256 shares, uint256 assets)'
);

function parseFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(name);
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function parseNum(name: string, fallback: number): number {
  const raw = parseFlag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }
  return n;
}

interface NormalizedEvent {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  user: string;
  type: 'deposit' | 'withdrawal' | 'emergency_withdrawal';
  assets: bigint;
  shares: bigint;
}

async function main() {
  const chainId = parseNum('--chainId', 5064014);
  const vaultAddrArg = parseFlag('--vaultAddress')?.toLowerCase();
  const nowFloored = Math.floor(Date.now() / 1000 / 14400) * 14400;
  const toTs = parseNum('--toTs', nowFloored);
  const fromTs = parseNum('--fromTs', toTs - 7 * 86400);

  if (fromTs >= toTs) {
    throw new Error(`--fromTs (${fromTs}) must be < --toTs (${toTs})`);
  }

  const configured = getConfiguredVaults(chainId);
  const vault = vaultAddrArg
    ? configured.find((v) => v.address === vaultAddrArg)
    : configured.find((v) => v.kind === 'protocol');
  if (!vault) {
    throw new Error(
      `No matching vault for chain=${chainId} vaultAddress=${vaultAddrArg ?? '(default protocol)'}.\n` +
        `Configured: ${configured.map((v) => `${v.kind}@${v.address}`).join(', ') || '(none)'}`
    );
  }

  const client = getProviderForChain(chainId);
  const fromBlockData = await getBlockByTimestamp(client, fromTs);
  const toBlockData = await getBlockByTimestamp(client, toTs);
  const fromBlock = fromBlockData.number;
  const toBlock = toBlockData.number;
  if (fromBlock === null || toBlock === null) {
    throw new Error('getBlockByTimestamp returned a pending block; cannot proceed.');
  }

  console.log(
    `[checkFlows] vault=${vault.address} (${vault.kind})  chainId=${chainId}`
  );
  console.log(
    `[checkFlows] window: ts ${fromTs}..${toTs}  ≈ block ${fromBlock}..${toBlock}`
  );

  const vaultAddress = vault.address as `0x${string}`;

  // ── 1. On-chain ──────────────────────────────────────────────────
  const [processed, emergency] = await Promise.all([
    client.getLogs({
      address: vaultAddress,
      event: processedEvent,
      fromBlock,
      toBlock,
    }),
    client.getLogs({
      address: vaultAddress,
      event: emergencyEvent,
      fromBlock,
      toBlock,
    }),
  ]);

  const onChain: NormalizedEvent[] = [];
  for (const log of processed) {
    const { user, direction, shares, assets } = log.args;
    if (
      user === undefined ||
      direction === undefined ||
      shares === undefined ||
      assets === undefined ||
      log.logIndex === null ||
      log.blockNumber === null
    ) {
      continue;
    }
    onChain.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex,
      blockNumber: Number(log.blockNumber),
      user: user.toLowerCase(),
      type: direction ? 'deposit' : 'withdrawal',
      assets,
      shares,
    });
  }
  for (const log of emergency) {
    const { user, shares, assets } = log.args;
    if (
      user === undefined ||
      shares === undefined ||
      assets === undefined ||
      log.logIndex === null ||
      log.blockNumber === null
    ) {
      continue;
    }
    onChain.push({
      txHash: log.transactionHash!,
      logIndex: log.logIndex,
      blockNumber: Number(log.blockNumber),
      user: user.toLowerCase(),
      type: 'emergency_withdrawal',
      assets,
      shares,
    });
  }
  onChain.sort((a, b) =>
    a.blockNumber - b.blockNumber || a.logIndex - b.logIndex
  );

  // ── 2. DB ────────────────────────────────────────────────────────
  const dbRows = await prisma.vaultFlowEvent.findMany({
    where: {
      chainId,
      vaultAddress: vault.address,
      blockNumber: { gte: Number(fromBlock), lte: Number(toBlock) },
    },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
  });

  // ── 3. Diff by (txHash, logIndex) ────────────────────────────────
  const onChainKey = (e: NormalizedEvent) => `${e.txHash}:${e.logIndex}`;
  const dbKey = (r: { transactionHash: string; logIndex: number }) =>
    `${r.transactionHash}:${r.logIndex}`;

  const onChainByKey = new Map(onChain.map((e) => [onChainKey(e), e]));
  const dbByKey = new Map(dbRows.map((r) => [dbKey(r), r]));

  const onlyOnChain = onChain.filter((e) => !dbByKey.has(onChainKey(e)));
  const onlyInDb = dbRows.filter((r) => !onChainByKey.has(dbKey(r)));

  console.log('\n── on-chain events ─────────────────────────────────────');
  console.log(
    `  ${onChain.length} total: ` +
      `${onChain.filter((e) => e.type === 'deposit').length} deposit, ` +
      `${onChain.filter((e) => e.type === 'withdrawal').length} withdrawal, ` +
      `${onChain.filter((e) => e.type === 'emergency_withdrawal').length} emergency_withdrawal`
  );
  for (const e of onChain) {
    console.log(
      `  blk ${e.blockNumber}  tx ${e.txHash.slice(0, 10)}…  user ${e.user.slice(0, 10)}…  ` +
        `${e.type.padEnd(20)}  ${formatUnits(e.assets, 18)} USDe`
    );
  }

  console.log('\n── vault_flow_event in same window ─────────────────────');
  console.log(
    `  ${dbRows.length} total: ` +
      `${dbRows.filter((r) => r.eventType === 'deposit').length} deposit, ` +
      `${dbRows.filter((r) => r.eventType === 'withdrawal').length} withdrawal, ` +
      `${dbRows.filter((r) => r.eventType === 'emergency_withdrawal').length} emergency_withdrawal`
  );

  console.log('\n── diff ────────────────────────────────────────────────');
  console.log(`  on-chain not in DB: ${onlyOnChain.length}`);
  for (const e of onlyOnChain) {
    console.log(
      `    blk ${e.blockNumber}  tx ${e.txHash.slice(0, 10)}…  ` +
        `${e.type.padEnd(20)}  ${formatUnits(e.assets, 18)} USDe`
    );
  }
  console.log(`  DB not on-chain:    ${onlyInDb.length}`);
  for (const r of onlyInDb) {
    console.log(
      `    blk ${r.blockNumber}  tx ${r.transactionHash.slice(0, 10)}…  ` +
        `${r.eventType.padEnd(20)}  ${formatUnits(BigInt(r.assets), 18)} USDe`
    );
  }

  // ── 4. Cumulative reconciliation up to toTs ──────────────────────
  // Snapshot rows store CUMULATIVE flows since vault.blockCreated, not just
  // the gap window's flows. Re-pull from-block-0 totals so we can compare
  // directly against what `calculateVaultFlows` would produce for the
  // snapshot at `toTs`.
  const dbCumulativeRows = await prisma.vaultFlowEvent.findMany({
    where: {
      chainId,
      vaultAddress: vault.address,
      timestamp: { lte: toTs },
    },
    select: { eventType: true, assets: true },
  });
  let dbCumDeposits = 0n;
  let dbCumWithdrawals = 0n;
  for (const r of dbCumulativeRows) {
    const a = BigInt(r.assets);
    if (r.eventType === 'deposit') dbCumDeposits += a;
    else dbCumWithdrawals += a;
  }

  // For the on-chain side, we'd need to scan the full vault.blockCreated..toBlock
  // history. That's expensive (it's exactly what `backfillVaultFlows.ts` does).
  // Instead, deduce it by adding the gap window's on-chain net to the DB
  // cumulative MINUS the DB rows already in the gap window.
  //
  // chainCum = (DB cum total) − (DB rows inside gap window) + (chain rows inside gap window)
  let dbInWindowDeposits = 0n;
  let dbInWindowWithdrawals = 0n;
  for (const r of dbRows) {
    const a = BigInt(r.assets);
    if (r.eventType === 'deposit') dbInWindowDeposits += a;
    else dbInWindowWithdrawals += a;
  }
  let chainInWindowDeposits = 0n;
  let chainInWindowWithdrawals = 0n;
  for (const e of onChain) {
    if (e.type === 'deposit') chainInWindowDeposits += e.assets;
    else chainInWindowWithdrawals += e.assets;
  }
  const chainCumDeposits =
    dbCumDeposits - dbInWindowDeposits + chainInWindowDeposits;
  const chainCumWithdrawals =
    dbCumWithdrawals - dbInWindowWithdrawals + chainInWindowWithdrawals;

  console.log('\n── reconciliation @ toTs ───────────────────────────────');
  console.log(
    `  DB    cumulative deposits @ ts<=${toTs}:  ${formatUnits(dbCumDeposits, 18).padStart(20)} USDe`
  );
  console.log(
    `  chain cumulative deposits (estimated):    ${formatUnits(chainCumDeposits, 18).padStart(20)} USDe`
  );
  console.log(
    `  DB    cumulative withdrawals @ ts<=${toTs}: ${formatUnits(dbCumWithdrawals, 18).padStart(20)} USDe`
  );
  console.log(
    `  chain cumulative withdrawals (estimated): ${formatUnits(chainCumWithdrawals, 18).padStart(20)} USDe`
  );
  const depDelta = chainCumDeposits - dbCumDeposits;
  const wdDelta = chainCumWithdrawals - dbCumWithdrawals;
  if (depDelta !== 0n || wdDelta !== 0n) {
    console.log('\n  ⚠ DB is missing on-chain flow events:');
    if (depDelta !== 0n) {
      console.log(`     deposits:    ${formatUnits(depDelta, 18)} USDe`);
    }
    if (wdDelta !== 0n) {
      console.log(`     withdrawals: ${formatUnits(wdDelta, 18)} USDe`);
    }
    console.log(
      '     → re-run scripts/backfillVaultFlows.ts --chainId ' + chainId
    );
  } else {
    console.log('\n  ✓ DB matches on-chain (within the inspected window).');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma
    .$disconnect()
    .catch(() => {})
    .finally(() => process.exit(1));
});
