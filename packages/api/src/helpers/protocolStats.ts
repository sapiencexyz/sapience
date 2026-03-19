import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { SettlementResult } from '../../generated/prisma';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
import { contracts } from '@sapience/sdk/contracts';
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
export async function fetchPredictionMarketTVL(
  chainId: number = DEFAULT_CHAIN_ID
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
 * Calculate vault's realized PnL from resolved predictions.
 *
 * Uses Picks.resolved (set automatically when all conditions settle)
 * rather than Prediction.settled (requires an explicit on-chain settle() call
 * that may never happen for losing predictions).
 */
async function calculateVaultPnL(
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
async function calculateVaultFlows(
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

/**
 * Main function to compute and store daily protocol stats snapshot.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID
): Promise<void> {
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, vault ${vaultAddress}`
  );

  // Use current timestamp for flexible snapshot frequency
  const timestamp = Math.floor(Date.now() / 1000);

  // Fetch balances
  const vaultBalance = await fetchVaultTVL(chainId);
  const vaultAvailableAssets = await fetchVaultAvailableAssets(chainId);
  const vaultDeployed = await fetchVaultDeployed(chainId);
  const escrowBalance = await fetchPredictionMarketTVL(chainId);

  console.log(
    `[ProtocolStats] Vault: ${formatUnits(vaultBalance, 18)} balance, ${formatUnits(vaultAvailableAssets, 18)} available, ${formatUnits(vaultDeployed, 18)} deployed`
  );
  console.log(`[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe`);

  // Calculate vault PnL
  const pnlResult = await calculateVaultPnL(chainId);
  console.log(
    `[ProtocolStats] Vault PnL: ${formatUnits(pnlResult.realizedPnL, 18)} USDe (won: ${pnlResult.positionsWon}, lost: ${pnlResult.positionsLost})`
  );

  // Calculate vault flows
  const flowsResult = await calculateVaultFlows(chainId);
  console.log(
    `[ProtocolStats] Deposits: ${formatUnits(flowsResult.totalDeposits, 18)}, Withdrawals: ${formatUnits(flowsResult.totalWithdrawals, 18)}`
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

/**
 * Backfill historical protocol stats by querying on-chain state at past blocks.
 */
export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}, vault ${vaultAddress}`
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

    try {
      // Query historical balances
      const vaultBalance = await fetchVaultTVLAtBlock(chainId, blockNumber);
      const vaultAvailableAssets = await fetchVaultAvailableAssetsAtBlock(
        chainId,
        blockNumber
      );
      const vaultDeployed = await fetchVaultDeployedAtBlock(
        chainId,
        blockNumber,
        timestamp
      );
      const escrowBalance = await fetchPredictionMarketTVLAtBlock(
        chainId,
        blockNumber
      );

      // Calculate PnL up to this timestamp
      const pnlResult = await calculateVaultPnL(chainId, timestamp);
      const flowsResult = await calculateVaultFlows(chainId, timestamp);

      // Calculate airdrop gains
      const actualTotalAssets = vaultBalance + vaultDeployed;
      const expectedTotalAssets =
        flowsResult.totalDeposits -
        flowsResult.totalWithdrawals +
        pnlResult.realizedPnL;
      const airdropGains =
        actualTotalAssets > expectedTotalAssets
          ? actualTotalAssets - expectedTotalAssets
          : 0n;

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

      console.log(
        `[ProtocolStats]   Vault: ${formatUnits(vaultAvailableAssets, 18)} available + ${formatUnits(vaultDeployed, 18)} deployed, Escrow: ${formatUnits(escrowBalance, 18)}, PnL: ${formatUnits(pnlResult.realizedPnL, 18)}, Airdrops: ${formatUnits(airdropGains, 18)}`
      );
      successCount++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('returned no data') ||
        errorMessage.includes('0x')
      ) {
        console.log(
          `[ProtocolStats] Skipping ${dateStr} - contract not deployed at block ${blockNumber}`
        );
        skipCount++;
      } else {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `[ProtocolStats] Backfill complete: ${successCount} days processed, ${skipCount} skipped`
  );
}
