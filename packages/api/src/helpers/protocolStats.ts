import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { LegacyPositionStatus } from '../../generated/prisma';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
import { contracts, escrowContracts } from '@sapience/sdk/contracts';
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

  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;
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
 */
export async function fetchVaultDeployed(
  chainId: number = DEFAULT_CHAIN_ID,
  atTimestamp?: number
): Promise<bigint> {
  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;
  if (!vaultAddress) return 0n;

  const predictions = await prisma.prediction.findMany({
    where: {
      chainId,
      counterparty: vaultAddress.toLowerCase(),
      ...(atTimestamp
        ? {
            onChainCreatedAt: { lte: atTimestamp },
            OR: [
              { settled: false },
              { settled: true, settledAt: { gt: atTimestamp } },
            ],
          }
        : { settled: false }),
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
  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;

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
  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;

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

  const escrowAddress =
    escrowContracts.predictionMarketEscrow[chainId]?.address;
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

  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;
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

  const escrowAddress =
    escrowContracts.predictionMarketEscrow[chainId]?.address;
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
 * Calculate vault's realized PnL from prediction positions.
 */
async function calculateVaultPnL(
  chainId: number,
  beforeTimestamp?: number
): Promise<VaultPnLResult> {
  const vaultAddress = escrowContracts.predictionMarketVault[chainId]?.address;
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
    status: { in: LegacyPositionStatus[] };
    predictorWon: { not: null };
    chainId: number;
    settledAt?: { lte: number };
    OR: Array<{ predictor: string } | { counterparty: string }>;
  } = {
    status: {
      in: [LegacyPositionStatus.settled, LegacyPositionStatus.consolidated],
    },
    predictorWon: { not: null },
    chainId,
    OR: [{ predictor: vaultAddressLower }, { counterparty: vaultAddressLower }],
  };

  if (beforeTimestamp) {
    whereClause.settledAt = { lte: beforeTimestamp };
  }

  const positions = await prisma.legacyPosition.findMany({
    where: whereClause,
  });

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
    escrowContracts.predictionMarketVault[chainId]?.address ?? ''
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
 * Get stats time series for the last N days.
 */
export async function getProtocolStatsTimeSeries(
  days: number = 90,
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string
) {
  const startTimestamp = getUtcMidnightTimestamp(new Date()) - days * 86400;

  return prisma.protocolStatsSnapshot.findMany({
    where: {
      timestamp: { gte: startTimestamp },
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
    escrowContracts.predictionMarketVault[chainId]?.address ?? ''
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
