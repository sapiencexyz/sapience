import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { PositionStatus } from '../../generated/prisma';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
import { contracts } from '@sapience/sdk/contracts';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

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
 * Fetch Vault balance: wUSDe.balanceOf(vault) only (excludes deployed funds).
 */
export async function fetchVaultTVL(
  chainId: number = CHAIN_ID_ETHEREAL
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.passiveLiquidityVault[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });

  return wUsdeBalance;
}

/**
 * Fetch PredictionMarket TVL: wUSDe.balanceOf(predictionMarket)
 */
export async function fetchPredictionMarketTVL(
  chainId: number = CHAIN_ID_ETHEREAL
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const pmAddress = contracts.predictionMarket[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!pmAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarket or collateral token not configured for chain ${chainId}`
    );
  }

  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [pmAddress],
  });

  return wUsdeBalance;
}

/**
 * Fetch Vault balance at a specific block number (for historical queries).
 */
export async function fetchVaultTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const vaultAddress = contracts.passiveLiquidityVault[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!vaultAddress || !collateralAddress) {
    throw new Error(
      `Vault or collateral token not configured for chain ${chainId}`
    );
  }

  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
    blockNumber,
  });

  return wUsdeBalance;
}

/**
 * Fetch PredictionMarket TVL at a specific block number (for historical queries).
 */
export async function fetchPredictionMarketTVLAtBlock(
  chainId: number,
  blockNumber: bigint
): Promise<bigint> {
  const client = getProviderForChain(chainId);

  const pmAddress = contracts.predictionMarket[chainId]?.address;
  const collateralAddress = contracts.collateralToken[chainId]?.address;

  if (!pmAddress || !collateralAddress) {
    throw new Error(
      `PredictionMarket or collateral token not configured for chain ${chainId}`
    );
  }

  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [pmAddress],
    blockNumber,
  });

  return wUsdeBalance;
}

/**
 * Calculate vault's realized PnL from prediction positions.
 */
async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultPnLResult> {
  const vaultAddress = contracts.passiveLiquidityVault[chainId]?.address;
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

  const whereClause: {
    status: { in: PositionStatus[] };
    predictorWon: { not: null };
    chainId: number;
    settledAt?: { lte: number };
    OR: Array<{ predictor: string } | { counterparty: string }>;
  } = {
    status: { in: [PositionStatus.settled, PositionStatus.consolidated] },
    predictorWon: { not: null },
    chainId,
    OR: [{ predictor: vaultAddressLower }, { counterparty: vaultAddressLower }],
  };

  if (beforeTimestamp) {
    whereClause.settledAt = { lte: beforeTimestamp };
  }

  const positions = await prisma.position.findMany({ where: whereClause });

  // Get mint events for collateral breakdown
  const mintTimestamps = Array.from(
    new Set(positions.map((p) => BigInt(p.mintedAt)))
  );
  const mintEvents = await prisma.event.findMany({
    where: { timestamp: { in: mintTimestamps } },
  });

  const mintEventMap = new Map<
    string,
    {
      makerCollateral: string;
      takerCollateral: string;
      totalCollateral: string;
    }
  >();
  for (const event of mintEvents) {
    try {
      const data = event.logData as {
        eventType?: string;
        makerNftTokenId?: string;
        takerNftTokenId?: string;
        makerCollateral?: string;
        takerCollateral?: string;
        totalCollateral?: string;
      };
      if (data.eventType === 'PredictionMinted') {
        const key = `${data.makerNftTokenId}-${data.takerNftTokenId}`;
        mintEventMap.set(key, {
          makerCollateral: data.makerCollateral || '0',
          takerCollateral: data.takerCollateral || '0',
          totalCollateral: data.totalCollateral || '0',
        });
      }
    } catch {
      continue;
    }
  }

  let realizedPnL = 0n;
  let positionsWon = 0;
  let positionsLost = 0;
  let totalCollateralWon = 0n;
  let totalCollateralLost = 0n;

  for (const position of positions) {
    const mintKey = `${position.predictorNftTokenId}-${position.counterpartyNftTokenId}`;
    const mintData = mintEventMap.get(mintKey);

    const predictorCollateral = BigInt(
      position.predictorCollateral || mintData?.makerCollateral || '0'
    );
    const counterpartyCollateral = BigInt(
      position.counterpartyCollateral || mintData?.takerCollateral || '0'
    );
    const totalCollateral = BigInt(position.totalCollateral || '0');

    const isVaultPredictor =
      position.predictor.toLowerCase() === vaultAddressLower;
    const vaultCollateral = isVaultPredictor
      ? predictorCollateral
      : counterpartyCollateral;

    const vaultWon = isVaultPredictor
      ? position.predictorWon === true
      : position.predictorWon === false;

    if (vaultWon) {
      const gains = totalCollateral - vaultCollateral;
      realizedPnL += gains;
      positionsWon++;
      totalCollateralWon += gains;
    } else {
      realizedPnL -= vaultCollateral;
      positionsLost++;
      totalCollateralLost += vaultCollateral;
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
  data: ProtocolStatsData
): Promise<void> {
  await prisma.protocolStatsSnapshot.upsert({
    where: { timestamp },
    create: {
      timestamp,
      chainId,
      vaultBalance: data.vaultBalance.toString(),
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
      chainId,
      vaultBalance: data.vaultBalance.toString(),
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
  chainId: number = CHAIN_ID_ETHEREAL
): Promise<void> {
  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}`
  );

  // Use current timestamp for flexible snapshot frequency
  const timestamp = Math.floor(Date.now() / 1000);

  // Fetch balances
  const vaultBalance = await fetchVaultTVL(chainId);
  console.log(`[ProtocolStats] Vault: ${formatUnits(vaultBalance, 18)} USDe`);

  const escrowBalance = await fetchPredictionMarketTVL(chainId);
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

  await upsertProtocolStatsSnapshot(timestamp, chainId, {
    vaultBalance,
    escrowBalance,
    vaultRealizedPnL: pnlResult.realizedPnL,
    vaultAirdropGains: 0n,
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
export async function getLatestProtocolStats() {
  return prisma.protocolStatsSnapshot.findFirst({
    orderBy: { timestamp: 'desc' },
  });
}

/**
 * Get stats time series for the last N days.
 */
export async function getProtocolStatsTimeSeries(days: number = 90) {
  const startTimestamp = getUtcMidnightTimestamp(new Date()) - days * 86400;

  return prisma.protocolStatsSnapshot.findMany({
    where: {
      timestamp: { gte: startTimestamp },
    },
    orderBy: { timestamp: 'asc' },
  });
}

/**
 * Backfill historical protocol stats by querying on-chain state at past blocks.
 */
export async function backfillProtocolStats(
  chainId: number = CHAIN_ID_ETHEREAL,
  days: number = 90
): Promise<void> {
  const client = getProviderForChain(chainId);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}`
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
      const escrowBalance = await fetchPredictionMarketTVLAtBlock(
        chainId,
        blockNumber
      );

      // Calculate PnL up to this timestamp
      const pnlResult = await calculateVaultPnL(chainId, timestamp);
      const flowsResult = await calculateVaultFlows(chainId, timestamp);

      await upsertProtocolStatsSnapshot(timestamp, chainId, {
        vaultBalance,
        escrowBalance,
        vaultRealizedPnL: pnlResult.realizedPnL,
        vaultAirdropGains: 0n,
        vaultDeposits: flowsResult.totalDeposits,
        vaultWithdrawals: flowsResult.totalWithdrawals,
        vaultPositionsWon: pnlResult.positionsWon,
        vaultPositionsLost: pnlResult.positionsLost,
        vaultCollateralWon: pnlResult.totalCollateralWon,
        vaultCollateralLost: pnlResult.totalCollateralLost,
      });

      console.log(
        `[ProtocolStats]   Vault: ${formatUnits(vaultBalance, 18)}, Escrow: ${formatUnits(escrowBalance, 18)}, PnL: ${formatUnits(pnlResult.realizedPnL, 18)}`
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
