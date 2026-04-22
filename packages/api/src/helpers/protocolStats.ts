import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { SettlementResult } from '../../generated/prisma';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
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

type VaultConfig = (typeof contracts.predictionMarketVault)[number];

export interface ConfiguredVault {
  kind: 'protocol' | 'pyth' | 'single-leg';
  config: VaultConfig;
  address: string;
}

/**
 * Return all vault contracts deployed on the given chain. Used to fan-out
 * per-vault snapshot computation.
 */
export function getConfiguredVaults(chainId: number): ConfiguredVault[] {
  const list: ConfiguredVault[] = [];
  const main = contracts.predictionMarketVault[chainId];
  if (main) {
    list.push({
      kind: 'protocol',
      config: main,
      address: main.address.toLowerCase(),
    });
  }
  const pyth = contracts.pythPredictionMarketVault[chainId];
  if (pyth) {
    list.push({
      kind: 'pyth',
      config: pyth,
      address: pyth.address.toLowerCase(),
    });
  }
  const single = contracts.singleLegVault[chainId];
  if (single) {
    list.push({
      kind: 'single-leg',
      config: single,
      address: single.address.toLowerCase(),
    });
  }
  return list;
}

function resolveVaultAddress(
  chainId: number,
  vaultAddressArg?: string
): string | undefined {
  return (
    vaultAddressArg ?? contracts.predictionMarketVault[chainId]?.address
  )?.toLowerCase();
}

/**
 * Fetch Vault balance: collateral.balanceOf(vault)
 */
export async function fetchVaultTVL(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
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
    args: [vaultAddress as `0x${string}`],
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
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress,
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
  atTimestamp?: number,
  vaultAddressArg?: string
): Promise<bigint> {
  return fetchVaultDeployed(chainId, atTimestamp, vaultAddressArg);
}

/**
 * Fetch Vault available assets: vault.availableAssets()
 */
export async function fetchVaultAvailableAssets(
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
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
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);

  if (!vaultAddress) {
    throw new Error(`Vault not configured for chain ${chainId}`);
  }

  const availableAssets = (await client.readContract({
    address: vaultAddress as `0x${string}`,
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
  blockNumber: bigint,
  vaultAddressArg?: string
): Promise<bigint> {
  const client = getProviderForChain(chainId);
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
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
    args: [vaultAddress as `0x${string}`],
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
 * Calculate vault's realized PnL from resolved predictions.
 *
 * Uses Picks.resolved (set automatically when all conditions settle)
 * rather than Prediction.settled (requires an explicit on-chain settle() call
 * that may never happen for losing predictions).
 */
export async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultPnLResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) {
    return {
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    };
  }

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      pickConfigId: { not: null },
      pickConfiguration: {
        resolved: true,
        result: { not: SettlementResult.UNRESOLVED },
        ...(beforeTimestamp ? { resolvedAt: { lte: beforeTimestamp } } : {}),
      },
      OR: [{ predictor: vaultAddress }, { counterparty: vaultAddress }],
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
      prediction.predictor.toLowerCase() === vaultAddress;

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
 * Calculate a vault's cumulative deposits and withdrawals from indexed flow
 * events. Events are keyed by vaultAddress so each deployment is isolated.
 */
export async function calculateVaultFlows(
  chainId: number,
  beforeTimestamp?: number,
  vaultAddressArg?: string
): Promise<VaultFlowsResult> {
  const vaultAddress = resolveVaultAddress(chainId, vaultAddressArg);
  if (!vaultAddress) return { totalDeposits: 0n, totalWithdrawals: 0n };

  const whereClause: {
    chainId: number;
    vaultAddress: string;
    timestamp?: { lte: number };
  } = { chainId, vaultAddress };

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

/**
 * Compute and store a snapshot for a single vault.
 */
async function computeAndStoreVaultStats(
  chainId: number,
  vault: ConfiguredVault,
  escrowBalance: bigint,
  timestamp: number
): Promise<void> {
  console.log(
    `[ProtocolStats] Computing ${vault.kind} vault ${vault.address} on chain ${chainId}`
  );

  const vaultBalance = await fetchVaultTVL(chainId, vault.address);
  const vaultAvailableAssets = await fetchVaultAvailableAssets(
    chainId,
    vault.address
  );
  const vaultDeployed = await fetchVaultDeployed(
    chainId,
    undefined,
    vault.address
  );

  console.log(
    `[ProtocolStats]   ${formatUnits(vaultBalance, 18)} balance, ${formatUnits(vaultAvailableAssets, 18)} available, ${formatUnits(vaultDeployed, 18)} deployed`
  );

  const pnlResult = await calculateVaultPnL(chainId, undefined, vault.address);
  console.log(
    `[ProtocolStats]   PnL: ${formatUnits(pnlResult.realizedPnL, 18)} USDe (won: ${pnlResult.positionsWon}, lost: ${pnlResult.positionsLost})`
  );

  const flowsResult = await calculateVaultFlows(
    chainId,
    undefined,
    vault.address
  );
  console.log(
    `[ProtocolStats]   Deposits: ${formatUnits(flowsResult.totalDeposits, 18)}, Withdrawals: ${formatUnits(flowsResult.totalWithdrawals, 18)}`
  );

  const actualTotalAssets = vaultBalance + vaultDeployed;
  const expectedTotalAssets =
    flowsResult.totalDeposits -
    flowsResult.totalWithdrawals +
    pnlResult.realizedPnL;
  const airdropGains =
    actualTotalAssets > expectedTotalAssets
      ? actualTotalAssets - expectedTotalAssets
      : 0n;

  await upsertProtocolStatsSnapshot(timestamp, chainId, vault.address, {
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
}

/**
 * Main function to compute and store daily protocol stats snapshots, one per
 * configured vault on the chain.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<void> {
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    console.log(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, ${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}`
  );

  const timestamp = getUtcMidnightTimestamp(new Date());

  // Escrow is shared across all vaults on the chain — compute once and attach
  // the same value to each per-vault snapshot.
  const escrowConfig = contracts.predictionMarketEscrow[chainId];
  let escrowBalance = await fetchPredictionMarketEscrowTVL(chainId);
  for (const legEntry of escrowConfig?.legacy ?? []) {
    const { address } = normalizeLegacyEntry(legEntry);
    try {
      escrowBalance += await fetchPredictionMarketEscrowTVL(chainId, address);
    } catch {
      // Legacy escrow may no longer exist
    }
  }
  console.log(
    `[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe (all contracts)`
  );

  for (const vault of vaults) {
    await computeAndStoreVaultStats(chainId, vault, escrowBalance, timestamp);
  }

  console.log(`[ProtocolStats] Snapshots stored successfully`);
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

// Ethereal mainnet launched ~October 20, 2025. Before this date, no contracts
// existed on-chain, so we create zero-valued snapshots as time-axis placeholders.
const ETHEREAL_MAINNET_LAUNCH = Math.floor(Date.UTC(2025, 9, 20) / 1000);

const ZERO_SNAPSHOT: ProtocolStatsData = {
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
};

async function backfillVaultStats(
  chainId: number,
  vault: ConfiguredVault,
  days: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;
  const escrowConfig = contracts.predictionMarketEscrow[chainId];

  console.log(
    `[ProtocolStats] Backfilling ${days} days for ${vault.kind} vault ${vault.address}`
  );

  const todayMidnight = getUtcMidnightTimestamp(new Date());
  const timestamps: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    timestamps.push(todayMidnight - i * 86400);
  }

  let successCount = 0;
  let skipCount = 0;

  for (let idx = 0; idx < timestamps.length; idx++) {
    const timestamp = timestamps[idx];
    const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];

    if (timestamp < ETHEREAL_MAINNET_LAUNCH) {
      console.log(
        `[ProtocolStats] ${dateStr} - before Ethereal mainnet launch, creating zero-valued snapshot`
      );
      await upsertProtocolStatsSnapshot(
        timestamp,
        chainId,
        vault.address,
        ZERO_SNAPSHOT
      );
      skipCount++;
      continue;
    }

    const block = await getBlockByTimestamp(client, timestamp);
    const blockNumber = block.number;

    if (blockNumber === null) {
      console.log(`[ProtocolStats] Skipping ${dateStr} - pending block`);
      skipCount++;
      continue;
    }

    console.log(
      `[ProtocolStats] Processing ${dateStr} (block ${blockNumber}) [${idx + 1}/${timestamps.length}]`
    );

    const vaultAddrAtBlock = getContractForBlock(vault.config, blockNumber);
    const escrowAddr = escrowConfig
      ? getContractForBlock(escrowConfig, blockNumber)
      : null;

    let vaultBalance = 0n;
    let vaultAvailableAssets = 0n;
    if (vaultAddrAtBlock && collateralAddress) {
      vaultBalance = await client.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [vaultAddrAtBlock],
        blockNumber,
      });
      try {
        vaultAvailableAssets = (await client.readContract({
          address: vaultAddrAtBlock,
          abi: predictionMarketVaultAbi,
          functionName: 'availableAssets',
          args: [],
          blockNumber,
        })) as bigint;
      } catch {
        // Older vault contracts may not have availableAssets()
        vaultAvailableAssets = vaultBalance;
      }
    }

    let escrowBalance = 0n;
    if (escrowAddr && collateralAddress) {
      escrowBalance = await client.readContract({
        address: collateralAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [escrowAddr],
        blockNumber,
      });
    }

    const vaultDeployed = await fetchVaultDeployedAtBlock(
      chainId,
      blockNumber,
      timestamp,
      vault.address
    );

    const pnlResult = await calculateVaultPnL(
      chainId,
      timestamp,
      vault.address
    );
    const flowsResult = await calculateVaultFlows(
      chainId,
      timestamp,
      vault.address
    );

    const actualTotalAssets = vaultBalance + vaultDeployed;
    const expectedTotalAssets =
      flowsResult.totalDeposits -
      flowsResult.totalWithdrawals +
      pnlResult.realizedPnL;
    const airdropGains =
      actualTotalAssets > expectedTotalAssets
        ? actualTotalAssets - expectedTotalAssets
        : 0n;

    await upsertProtocolStatsSnapshot(timestamp, chainId, vault.address, {
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

    console.log(
      `[ProtocolStats]   Vault: ${formatUnits(vaultAvailableAssets, 18)} available + ${formatUnits(vaultDeployed, 18)} deployed, Escrow: ${formatUnits(escrowBalance, 18)}, PnL: ${formatUnits(pnlResult.realizedPnL, 18)}, Airdrops: ${formatUnits(airdropGains, 18)}`
    );
    successCount++;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `[ProtocolStats] Backfill for ${vault.kind} complete: ${successCount} processed, ${skipCount} skipped`
  );
}

/**
 * Backfill historical protocol stats by querying on-chain state at past blocks,
 * iterating over every configured vault on the chain.
 */
export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90
): Promise<void> {
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    console.log(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  console.log(
    `[ProtocolStats] Starting backfill for chain ${chainId}, ${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}`
  );

  for (const vault of vaults) {
    await backfillVaultStats(chainId, vault, days);
  }
}
