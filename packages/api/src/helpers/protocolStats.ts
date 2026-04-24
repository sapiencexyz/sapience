import { erc20Abi, formatUnits, type Block } from 'viem';
import prisma from '../db';
import { SettlementResult } from '../../generated/prisma';
import {
  getProviderForChain,
  getBlockByTimestamp,
  resolveBlocksForTimestamps,
} from '../utils/utils';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

interface VaultPnLResult {
  realizedPnL: bigint;
  positionsWon: number;
  positionsLost: number;
  totalCollateralWon: bigint;
  totalCollateralLost: bigint;
}

interface VaultFlowsResult {
  totalDeposits: bigint;
  totalWithdrawals: bigint;
}

interface ProtocolStatsData {
  vaultBalance: bigint;
  vaultAvailableAssets: bigint;
  vaultDeployed: bigint;
  escrowBalance: bigint;
  vaultRealizedPnL: bigint;
  vaultAirdropGains: bigint;
  vaultDeposits: bigint;
  vaultWithdrawals: bigint;
  vaultPositionsWon: number;
  vaultPositionsLost: number;
  vaultCollateralWon: bigint;
  vaultCollateralLost: bigint;
}

/**
 * Fetch Vault balance: collateral.balanceOf(vault)
 */
export async function fetchVaultTVL(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });

  return balance;
}

/**
 * Fetch vault collateral locked in the escrow: sum of counterpartyCollateral
 * for predictions that were active at `atTimestamp` (or currently active if omitted)
 * where the vault is the counterparty.
 *
 * Uses Picks.resolved / Picks.resolvedAt instead of Prediction.settled / settledAt
 * because losing predictions may never get settled on-chain.
 */
export async function fetchVaultDeployed(
  chainId: number = DEFAULT_CHAIN_ID,
  atTimestamp?: number
): Promise<bigint> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress.toLowerCase(),
      ...(atTimestamp
        ? {
            onChainCreatedAt: { lte: atTimestamp },
            OR: [
              // No pick config linked — treat as active
              { pickConfigId: null },
              // Pick config not yet resolved
              { pickConfiguration: { resolved: false } },
              // Pick config resolved after the queried timestamp
              {
                pickConfiguration: {
                  resolved: true,
                  resolvedAt: { gt: atTimestamp },
                },
              },
            ],
          }
        : {
            OR: [
              { pickConfigId: null },
              { pickConfiguration: { resolved: false } },
            ],
          }),
    },
    select: { counterpartyCollateral: true },
  });

  let total = 0n;
  for (const p of predictions) {
    total += BigInt(p.counterpartyCollateral);
  }
  return total;
}

/**
 * Fetch vault collateral locked in the escrow at a specific point in time.
 */
export async function fetchVaultDeployedAtBlock(
  chainId: number,
  _blockNumber: bigint,
  atTimestamp?: number
): Promise<bigint> {
  return fetchVaultDeployed(chainId, atTimestamp);
}

/**
 * Fetch Vault available assets: vault.availableAssets()
 */
export async function fetchVaultAvailableAssets(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Vault available assets at a specific block number.
 */
export async function fetchVaultAvailableAssetsAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress,
    abi: predictionMarketVaultAbi,
    functionName: 'availableAssets',
    args: [],
    blockNumber,
  })) as bigint;

  return availableAssets;
}

/**
 * Fetch Escrow TVL: collateral.balanceOf(predictionMarketEscrow)
 */
export async function fetchPredictionMarketEscrowTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  escrowAddressOverride?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress =
    escrowAddressOverride || contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress as `0x${string}`],
  });

  return balance;
}

/**
 * Fetch Vault balance at a specific block number (for historical queries).
 */
export async function fetchVaultTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
    blockNumber,
  });

  return balance;
}

/**
 * Fetch Escrow TVL at a specific block number (for historical queries).
 */
export async function fetchPredictionMarketTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const escrowAddress = contracts.predictionMarketEscrow[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!escrowAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarketEscrow or collateral token not configured for chain ${chainId}`
    );
  }

  const balance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [escrowAddress],
    blockNumber,
  });

  return balance;
}

/**
 * Find the correct contract address for a given block number by checking
 * blockCreated timestamps. Returns the contract that was deployed at or before
 * the given block, preferring newer deployments.
 *
 * Order: current contract first, then legacy entries in array order.
 * Each entry's blockCreated indicates when it was deployed — if the target
 * block is before that, skip to the next (older) contract.
 */
function getContractForBlock(
  contractConfig: (typeof contracts.predictionMarketVault)[number],
  blockNumber: bigint
): `0x${string}` | null {
  const currentBlock = contractConfig.blockCreated ?? 0;
  if (blockNumber >= BigInt(currentBlock)) {
    return contractConfig.address as `0x${string}`;
  }

  for (const legEntry of contractConfig.legacy ?? []) {
    const entry = normalizeLegacyEntry(legEntry);
    if (blockNumber >= BigInt(entry.blockCreated)) {
      return entry.address as `0x${string}`;
    }
  }

  return null;
}

/**
 * Sum the collateral balance across the current V2 escrow + every past V2 escrow
 * deployment, pinned to `blockNumber`. Iterates over the deduped list of
 * [primary, ...legacies] straight from the SDK config — avoids double-counting
 * when `getContractForBlock` would return a legacy (pre-redeploy blocks) and
 * we'd otherwise re-read it from the legacy loop. For blocks where a contract
 * wasn't deployed yet, `balanceOf` returns 0 (the token's storage slot is
 * simply empty for that address), so earlier blocks just get a smaller total.
 */
async function sumEscrowBalancesAtBlock(
  client: ReturnType<typeof getProviderForChain>,
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;
  if (!escrowConfig || !collateralAddress) return 0n;

  const addrs = new Set<`0x${string}`>([escrowConfig.address as `0x${string}`]);
  for (const le of escrowConfig.legacy ?? []) {
    addrs.add(normalizeLegacyEntry(le).address as `0x${string}`);
  }

  let total = 0n;
  for (const addr of addrs) {
    try {
      total += await client.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [addr],
        blockNumber,
      });
    } catch {
      // Contract not deployed at this block or balanceOf reverted — treat as 0.
    }
  }
  return total;
}

/**
 * Calculate vault's realized PnL from resolved predictions.
 *
 * Uses Picks.resolved (set automatically when all conditions settle)
 * rather than Prediction.settled (requires an explicit on-chain settle() call
 * that may never happen for losing predictions).
 */
export async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultPnLResult> {
  const vaultAddress = contracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) {
    return {
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    };
  }
  const vaultAddressLower = vaultAddress.toLowerCase();

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      pickConfigId: { not: null },
      pickConfiguration: {
        resolved: true,
        result: { not: SettlementResult.UNRESOLVED },
        ...(beforeTimestamp ? { resolvedAt: { lte: beforeTimestamp } } : {}),
      },
      OR: [
        { predictor: vaultAddressLower },
        { counterparty: vaultAddressLower },
      ],
    },
    include: {
      pickConfiguration: { select: { result: true } },
    },
  });

  let realizedPnL = 0n;
  let positionsWon = 0;
  let positionsLost = 0;
  let totalCollateralWon = 0n;
  let totalCollateralLost = 0n;

  for (const prediction of predictions) {
    const picksResult = prediction.pickConfiguration?.result;
    if (!picksResult || picksResult === SettlementResult.UNRESOLVED) continue;

    const predictorCollateral = BigInt(prediction.predictorCollateral);
    const counterpartyCollateral = BigInt(prediction.counterpartyCollateral);

    const isVaultPredictor =
      prediction.predictor.toLowerCase() === vaultAddressLower;

    const vaultWon =
      (isVaultPredictor && picksResult === SettlementResult.PREDICTOR_WINS) ||
      (!isVaultPredictor && picksResult === SettlementResult.COUNTERPARTY_WINS);

    if (vaultWon) {
      const gains = isVaultPredictor
        ? counterpartyCollateral
        : predictorCollateral;
      realizedPnL += gains;
      positionsWon++;
      totalCollateralWon += gains;
    } else {
      const loss = isVaultPredictor
        ? predictorCollateral
        : counterpartyCollateral;
      realizedPnL -= loss;
      positionsLost++;
      totalCollateralLost += loss;
    }
  }

  return {
    realizedPnL,
    positionsWon,
    positionsLost,
    totalCollateralWon,
    totalCollateralLost,
  };
}

/**
 * Calculate vault's cumulative deposits and withdrawals from indexed flow events.
 */
export async function calculateVaultFlows(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultFlowsResult> {
  const whereClause: { chainId: number; timestamp?: { lte: number } } = {
    chainId,
  };

  if (beforeTimestamp) {
    whereClause.timestamp = { lte: beforeTimestamp };
  }

  const events = await prisma.vaultFlowEvent.findMany({ where: whereClause });

  let totalDeposits = 0n;
  let totalWithdrawals = 0n;

  for (const event of events) {
    const assets = BigInt(event.assets);
    if (event.eventType === 'deposit') {
      totalDeposits += assets;
    } else {
      totalWithdrawals += assets;
    }
  }

  return { totalDeposits, totalWithdrawals };
}

/**
 * Get UTC midnight timestamp for a given date.
 */
function getUtcMidnightTimestamp(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      1000
  );
}

/**
 * Create or update stats snapshot with all data.
 */
async function upsertProtocolStatsSnapshot(
  timestamp: number,
  chainId: number,
  vaultAddress: string,
  data: ProtocolStatsData
): Promise<void> {
  await prisma.protocolStatsSnapshot.upsert({
    where: {
      chainId_vaultAddress_timestamp: { chainId, vaultAddress, timestamp },
    },
    create: {
      timestamp,
      chainId,
      vaultAddress,
      vaultBalance: data.vaultBalance.toString(),
      vaultAvailableAssets: data.vaultAvailableAssets.toString(),
      vaultDeployed: data.vaultDeployed.toString(),
      escrowBalance: data.escrowBalance.toString(),
      vaultRealizedPnL: data.vaultRealizedPnL.toString(),
      vaultAirdropGains: data.vaultAirdropGains.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
    },
    update: {
      vaultBalance: data.vaultBalance.toString(),
      vaultAvailableAssets: data.vaultAvailableAssets.toString(),
      vaultDeployed: data.vaultDeployed.toString(),
      escrowBalance: data.escrowBalance.toString(),
      vaultRealizedPnL: data.vaultRealizedPnL.toString(),
      vaultAirdropGains: data.vaultAirdropGains.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
    },
  });
}

const DEFAULT_SNAPSHOT_INTERVAL_SECONDS = 86400;

export function resolveSnapshotIntervalSeconds(override?: number): number {
  if (override && Number.isFinite(override) && override > 0) return override;
  const env = process.env.PROTOCOL_STATS_INTERVAL_SECONDS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SNAPSHOT_INTERVAL_SECONDS;
}

/**
 * Main function to compute and store a protocol stats snapshot.
 *
 * The snapshot timestamp is floored to the configured interval so bars line
 * up on predictable boundaries regardless of exactly when the cron fires.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, vault ${vaultAddress}, interval ${interval}s`
  );

  const timestamp = Math.floor(Date.now() / 1000 / interval) * interval;

  // Resolve the block for this timestamp so on-chain reads are pinned. Without
  // this, readContract would fall through to chain head, which can be several
  // seconds/minutes past the stored timestamp — causing systematic drift
  // between cron snapshots and backfilled snapshots for the same timestamp.
  const targetBlock = await getBlockByTimestamp(client, timestamp);
  const blockNumber = targetBlock.number;
  if (blockNumber === null) {
    throw new Error(
      `[ProtocolStats] Resolved a pending block for timestamp ${timestamp}; refusing to write a snapshot at chain-head state.`
    );
  }
  console.log(
    `[ProtocolStats] Resolved block ${blockNumber} for timestamp ${timestamp} (block ts=${targetBlock.timestamp})`
  );

  // Pick historically-correct vault address for this block — handles vault
  // migrations via `getContractForBlock`. Escrow totals are aggregated
  // separately by `sumEscrowBalancesAtBlock`.
  const vaultConfig = contracts.predictionMarketVault[chainId];
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;

  const vaultAddr = vaultConfig
    ? getContractForBlock(vaultConfig, blockNumber)
    : null;

  // On-chain reads, all pinned to `blockNumber` and run in parallel. The
  // availableAssets() read may revert on older vault contracts that pre-date
  // that function — catch and fall through to vaultBalance. Escrow is summed
  // across current + all past V2 deploys, so funds stuck in old escrow
  // contracts are still counted.
  const [vaultBalance, vaultAvailableAssetsOrNull, escrowBalance] =
    await Promise.all([
      vaultAddr && collateralAddress
        ? client.readContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [vaultAddr],
            blockNumber,
          })
        : Promise.resolve(0n),
      vaultAddr && collateralAddress
        ? client
            .readContract({
              address: vaultAddr,
              abi: predictionMarketVaultAbi,
              functionName: 'availableAssets',
              args: [],
              blockNumber,
            })
            .then((v: unknown) => v as bigint)
            .catch(() => null as bigint | null)
        : Promise.resolve(0n as bigint | null),
      sumEscrowBalancesAtBlock(client, chainId, blockNumber),
    ]);

  const vaultAvailableAssets =
    vaultAvailableAssetsOrNull === null
      ? vaultBalance
      : vaultAvailableAssetsOrNull;

  console.log(
    `[ProtocolStats] Vault: ${formatUnits(vaultBalance, 18)} balance, ${formatUnits(vaultAvailableAssets, 18)} available`
  );
  console.log(
    `[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe (V2 primary + past deploys)`
  );

  // DB-derived aggregates — pass the same snapshot timestamp so these are also
  // evaluated at "state as of timestamp", matching the on-chain reads above.
  const [vaultDeployed, pnlResult, flowsResult] = await Promise.all([
    fetchVaultDeployedAtBlock(chainId, blockNumber, timestamp),
    calculateVaultPnL(chainId, timestamp),
    calculateVaultFlows(chainId, timestamp),
  ]);
  console.log(
    `[ProtocolStats] Vault PnL: ${formatUnits(pnlResult.realizedPnL, 18)} USDe (won: ${pnlResult.positionsWon}, lost: ${pnlResult.positionsLost})`
  );
  console.log(
    `[ProtocolStats] Deposits: ${formatUnits(flowsResult.totalDeposits, 18)}, Withdrawals: ${formatUnits(flowsResult.totalWithdrawals, 18)}, Deployed: ${formatUnits(vaultDeployed, 18)}`
  );

  // Calculate airdrop gains: unexplained balance increases
  // Actual total assets = vaultBalance + vaultDeployed
  // Expected total assets = deposits - withdrawals + realizedPnL
  // Airdrop gains = actual - expected
  const actualTotalAssets = vaultBalance + vaultDeployed;
  const expectedTotalAssets =
    flowsResult.totalDeposits -
    flowsResult.totalWithdrawals +
    pnlResult.realizedPnL;
  const airdropGains =
    actualTotalAssets > expectedTotalAssets
      ? actualTotalAssets - expectedTotalAssets
      : 0n;

  console.log(
    `[ProtocolStats] Airdrop gains: ${formatUnits(airdropGains, 18)} USDe`
  );

  await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
    vaultBalance,
    vaultAvailableAssets,
    vaultDeployed,
    escrowBalance,
    vaultRealizedPnL: pnlResult.realizedPnL,
    vaultAirdropGains: airdropGains,
    vaultDeposits: flowsResult.totalDeposits,
    vaultWithdrawals: flowsResult.totalWithdrawals,
    vaultPositionsWon: pnlResult.positionsWon,
    vaultPositionsLost: pnlResult.positionsLost,
    vaultCollateralWon: pnlResult.totalCollateralWon,
    vaultCollateralLost: pnlResult.totalCollateralLost,
  });

  console.log(`[ProtocolStats] Snapshot stored successfully`);
}

/**
 * Get the latest stats snapshot.
 */
export async function getLatestProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string
) {
  return prisma.protocolStatsSnapshot.findFirst({
    where: { chainId, ...(vaultAddress ? { vaultAddress } : {}) },
    orderBy: { timestamp: 'desc' },
  });
}

/**
 * Get stats time series. If days is provided, limits to the last N days.
 * If omitted, returns all available snapshots.
 */
export async function getProtocolStatsTimeSeries(
  days?: number,
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string
) {
  return prisma.protocolStatsSnapshot.findMany({
    where: {
      ...(days
        ? {
            timestamp: {
              gte: getUtcMidnightTimestamp(new Date()) - days * 86400,
            },
          }
        : {}),
      chainId,
      ...(vaultAddress ? { vaultAddress } : {}),
    },
    orderBy: { timestamp: 'asc' },
  });
}

// Phase 1 (block resolution) is RPC-only: 1 inflight RPC per worker.
// 10 workers ≈ 10 req/sec peak.
const BACKFILL_BLOCK_RESOLUTION_CONCURRENCY = 10;

// Phase 2 (per-snapshot work) fires 3 parallel RPC reads per worker.
// 3 workers × 3 parallel reads = ~9 concurrent RPCs at peak — under
// Conduit's free-tier rate limits. Also comfortably below Prisma's default
// 10-conn pool (3 workers × 3 parallel DB reads = ~9 peak queries).
const BACKFILL_SNAPSHOT_CONCURRENCY = 3;

/**
 * Backfill historical protocol stats by querying on-chain state at past blocks.
 *
 * `days` is the time horizon (how far back to go). `intervalSeconds` controls
 * the spacing between snapshots — defaults to the configured snapshot interval
 * (env `PROTOCOL_STATS_INTERVAL_SECONDS`, fallback 86400).
 *
 * Runs in two phases:
 *   Phase 1: resolve every non-pre-launch timestamp to a block number in bulk,
 *            using a chunked blockspace skeleton + parallel binary searches
 *            (see `resolveBlocksForTimestamps` in utils).
 *   Phase 2: for each (timestamp, blockNumber) pair, fetch on-chain state +
 *            aggregate DB-derived metrics + upsert, all under BACKFILL_SNAPSHOT_CONCURRENCY.
 */
export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}, vault ${vaultAddress}, interval ${interval}s, phase1-concurrency ${BACKFILL_BLOCK_RESOLUTION_CONCURRENCY}, phase2-concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY}`
  );

  // End boundary is "now" floored to the interval; walk back in interval steps.
  const endBoundary = Math.floor(Date.now() / 1000 / interval) * interval;
  const totalSpan = days * 86400;
  const steps = Math.floor(totalSpan / interval);
  const timestamps: number[] = [];
  for (let i = steps; i >= 0; i--) {
    timestamps.push(endBoundary - i * interval);
  }

  // Per-phase wall-clock timing.
  const totals = {
    skeleton: 0,
    resolveBlocks: 0,
    rpcReads: 0,
    dbReads: 0,
    upsert: 0,
  };

  // Ethereal mainnet launched ~October 20, 2025. Before this date no contracts
  // existed on-chain, so pre-launch rows get a zero-valued upsert (no RPC).
  const ETHEREAL_MAINNET_LAUNCH = Math.floor(Date.UTC(2025, 9, 20) / 1000);

  const preLaunch = timestamps.filter((t) => t < ETHEREAL_MAINNET_LAUNCH);
  const postLaunch = timestamps.filter((t) => t >= ETHEREAL_MAINNET_LAUNCH);

  console.log(
    `[ProtocolStats] Timestamps built: total=${timestamps.length}, preLaunch=${preLaunch.length}, postLaunch=${postLaunch.length}`
  );

  const backfillStart = performance.now();
  let successCount = 0;
  let skipCount = 0;
  const resolved: Array<{ timestamp: number; blockNumber: bigint }> = [];
  let crashError: unknown = null;

  try {
    // ── Phase 1: resolve blocks for all post-launch timestamps in bulk ──
    const tResolve = performance.now();
    let blocks: Block[] = [];
    if (postLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 1: starting block resolution for ${postLaunch.length} post-launch timestamps...`
      );
      blocks = await resolveBlocksForTimestamps(client, postLaunch, {
        concurrency: BACKFILL_BLOCK_RESOLUTION_CONCURRENCY,
        logPrefix: '[ProtocolStats] Phase 1',
      });
    } else {
      console.log(
        `[ProtocolStats] Phase 1: skipped (no post-launch timestamps)`
      );
    }
    totals.resolveBlocks = performance.now() - tResolve;

    console.log(
      `[ProtocolStats] Phase 1: resolved ${postLaunch.length} target blocks in ${(totals.resolveBlocks / 1000).toFixed(1)}s`
    );

    // Pair post-launch timestamps with their resolved blocks.
    for (let i = 0; i < postLaunch.length; i++) {
      const blockNumber = blocks[i]?.number;
      if (blockNumber === null || blockNumber === undefined) {
        console.log(
          `[ProtocolStats] Skipping ${postLaunch[i]} - no block resolved`
        );
        continue;
      }
      resolved.push({ timestamp: postLaunch[i], blockNumber });
    }

    // ── Phase 2: parallel per-snapshot work ──
    // Escrow aggregation is handled inside `sumEscrowBalancesAtBlock`, so we only
    // need the vault config here. Collateral address is still needed for the
    // balance-of vault read.
    const vaultConfig = contracts.predictionMarketVault[chainId];
    const collateralAddress = contracts.collateralToken[chainId]?.address as
      | `0x${string}`
      | undefined;

    // Pre-launch zero-fills first — just DB upserts, no RPC.
    if (preLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2a: upserting ${preLaunch.length} pre-launch zero-fills...`
      );
      const tPreLaunch = performance.now();
      const preStep = Math.max(1, Math.floor(preLaunch.length / 10));
      await runParallelWork(
        preLaunch,
        BACKFILL_SNAPSHOT_CONCURRENCY,
        async (timestamp) => {
          const t0 = performance.now();
          await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
            vaultBalance: 0n,
            vaultAvailableAssets: 0n,
            vaultDeployed: 0n,
            escrowBalance: 0n,
            vaultRealizedPnL: 0n,
            vaultAirdropGains: 0n,
            vaultDeposits: 0n,
            vaultWithdrawals: 0n,
            vaultPositionsWon: 0,
            vaultPositionsLost: 0,
            vaultCollateralWon: 0n,
            vaultCollateralLost: 0n,
          });
          totals.upsert += performance.now() - t0;
          skipCount++;
          if (skipCount % preStep === 0 || skipCount === preLaunch.length) {
            console.log(
              `[ProtocolStats] Phase 2a: ${skipCount}/${preLaunch.length} (${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s)`
            );
          }
        }
      );
      console.log(
        `[ProtocolStats] Phase 2a: done in ${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s`
      );
    }

    // Real on-chain snapshots.
    if (resolved.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2b: fetching on-chain state + DB aggregates for ${resolved.length} snapshots (concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY})...`
      );
    }
    let doneCount = 0;
    await runParallelWork(
      resolved,
      BACKFILL_SNAPSHOT_CONCURRENCY,
      async ({ timestamp, blockNumber }) => {
        const iterStart = performance.now();
        const dateStr =
          interval < 86400
            ? new Date(timestamp * 1000).toISOString().replace('.000Z', 'Z')
            : new Date(timestamp * 1000).toISOString().split('T')[0];

        const vaultAddr = vaultConfig
          ? getContractForBlock(vaultConfig, blockNumber)
          : null;

        // Three balance reads in parallel — share blockNumber. Escrow sums
        // across current + all past V2 deploys (see sumEscrowBalancesAtBlock),
        // so funds still sitting in old escrow contracts are included.
        // availableAssets() may revert on legacy vaults; fall back to vaultBalance.
        const tRpc = performance.now();
        const [vaultBalance, vaultAvailableAssetsOrNull, escrowBalance] =
          await Promise.all([
            vaultAddr && collateralAddress
              ? client.readContract({
                  address: collateralAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [vaultAddr],
                  blockNumber,
                })
              : Promise.resolve(0n),
            vaultAddr && collateralAddress
              ? client
                  .readContract({
                    address: vaultAddr,
                    abi: predictionMarketVaultAbi,
                    functionName: 'availableAssets',
                    args: [],
                    blockNumber,
                  })
                  .then((v) => v as bigint)
                  .catch(() => null as bigint | null)
              : Promise.resolve(0n as bigint | null),
            sumEscrowBalancesAtBlock(client, chainId, blockNumber),
          ]);
        totals.rpcReads += performance.now() - tRpc;

        const vaultAvailableAssets =
          vaultAvailableAssetsOrNull === null
            ? vaultBalance
            : vaultAvailableAssetsOrNull;

        // Three DB reads in parallel — independent at this timestamp.
        const tDb = performance.now();
        const [vaultDeployed, pnlResult, flowsResult] = await Promise.all([
          fetchVaultDeployedAtBlock(chainId, blockNumber, timestamp),
          calculateVaultPnL(chainId, timestamp),
          calculateVaultFlows(chainId, timestamp),
        ]);
        totals.dbReads += performance.now() - tDb;

        const actualTotalAssets = vaultBalance + vaultDeployed;
        const expectedTotalAssets =
          flowsResult.totalDeposits -
          flowsResult.totalWithdrawals +
          pnlResult.realizedPnL;
        const airdropGains =
          actualTotalAssets > expectedTotalAssets
            ? actualTotalAssets - expectedTotalAssets
            : 0n;

        const tUpsert = performance.now();
        await upsertProtocolStatsSnapshot(timestamp, chainId, vaultAddress, {
          vaultBalance,
          vaultAvailableAssets,
          vaultDeployed,
          escrowBalance,
          vaultRealizedPnL: pnlResult.realizedPnL,
          vaultAirdropGains: airdropGains,
          vaultDeposits: flowsResult.totalDeposits,
          vaultWithdrawals: flowsResult.totalWithdrawals,
          vaultPositionsWon: pnlResult.positionsWon,
          vaultPositionsLost: pnlResult.positionsLost,
          vaultCollateralWon: pnlResult.totalCollateralWon,
          vaultCollateralLost: pnlResult.totalCollateralLost,
        });
        totals.upsert += performance.now() - tUpsert;

        successCount++;
        doneCount++;
        const iterMs = performance.now() - iterStart;
        console.log(
          `[ProtocolStats] ${dateStr} block=${blockNumber} [${doneCount}/${resolved.length}] ` +
            `iter=${iterMs.toFixed(0)}ms | ` +
            `vault=${formatUnits(vaultAvailableAssets, 18)}+${formatUnits(vaultDeployed, 18)} ` +
            `escrow=${formatUnits(escrowBalance, 18)} pnl=${formatUnits(pnlResult.realizedPnL, 18)}`
        );
      }
    );
  } catch (err) {
    crashError = err;
    console.error(
      '[ProtocolStats] Backfill threw — printing partial stats below:',
      err
    );
  }

  // Always print the summary — on both success and failure.
  const elapsedMs = performance.now() - backfillStart;
  const phase2WallMs = Math.max(0, elapsedMs - totals.resolveBlocks);
  const phase2CumulativeMs = totals.rpcReads + totals.dbReads + totals.upsert;
  const wallPct = (ms: number) =>
    `${(ms / 1000).toFixed(1)}s (${elapsedMs > 0 ? ((ms / elapsedMs) * 100).toFixed(1) : '0'}% wall)`;
  const cumShare = (ms: number) =>
    `${(ms / 1000).toFixed(1)}s cumulative across workers (${phase2CumulativeMs > 0 ? ((ms / phase2CumulativeMs) * 100).toFixed(1) : '0'}% of phase-2 work)`;
  const verdict = crashError ? 'INCOMPLETE (see error above)' : 'complete';
  console.log(
    `[ProtocolStats] Backfill ${verdict}: ${successCount} snapshots processed, ${skipCount} pre-launch zero-fills, ${Math.max(0, postLaunch.length - resolved.length)} skipped in ${(elapsedMs / 1000).toFixed(1)}s\n` +
      `  Phase 1 (block resolution): ${wallPct(totals.resolveBlocks)}\n` +
      `  Phase 2 (per-snapshot work): ${wallPct(phase2WallMs)}\n` +
      `    rpc reads:    ${cumShare(totals.rpcReads)}\n` +
      `    db reads:     ${cumShare(totals.dbReads)}\n` +
      `    db upsert:    ${cumShare(totals.upsert)}`
  );

  if (crashError) throw crashError;
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight. Awaits all
 * to finish. Unlike the one in utils, this doesn't need to return results.
 */
async function runParallelWork<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        await fn(items[idx]);
      }
    }
  );
  await Promise.all(workers);
}
