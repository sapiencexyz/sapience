import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { getProviderForChain } from '../utils/utils';
import { contracts } from '@sapience/sdk/contracts';
import { liquidityVaultAbi } from '@sapience/sdk/abis';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

/**
 * Fetch Vault TVL: wUSDe.balanceOf(vault) + vault.totalDeployed()
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

  // Fetch wUSDe balance of the vault
  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddress],
  });

  // Fetch totalDeployed from vault contract
  const totalDeployed = (await client.readContract({
    address: vaultAddress,
    abi: liquidityVaultAbi,
    functionName: 'totalDeployed',
    args: [],
  })) as bigint;

  return wUsdeBalance + totalDeployed;
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

  // Fetch wUSDe balance of the PredictionMarket
  const wUsdeBalance = await client.readContract({
    address: collateralAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [pmAddress],
  });

  return wUsdeBalance;
}

/**
 * Create or update daily TVL snapshot.
 */
export async function upsertProtocolTVLSnapshot(
  chainId: number,
  snapshotDate: Date,
  vaultTVL: bigint,
  predictionMarketTVL: bigint
): Promise<void> {
  // Normalize to UTC midnight
  const normalizedDate = new Date(
    Date.UTC(
      snapshotDate.getUTCFullYear(),
      snapshotDate.getUTCMonth(),
      snapshotDate.getUTCDate()
    )
  );

  const totalTVL = vaultTVL + predictionMarketTVL;

  await prisma.protocolTVLSnapshot.upsert({
    where: {
      snapshotDate_chainId: {
        snapshotDate: normalizedDate,
        chainId,
      },
    },
    create: {
      snapshotDate: normalizedDate,
      chainId,
      vaultTVL: vaultTVL.toString(),
      predictionMarketTVL: predictionMarketTVL.toString(),
      totalTVL: totalTVL.toString(),
      computedAt: new Date(),
    },
    update: {
      vaultTVL: vaultTVL.toString(),
      predictionMarketTVL: predictionMarketTVL.toString(),
      totalTVL: totalTVL.toString(),
      computedAt: new Date(),
    },
  });
}

/**
 * Main function to compute and store daily Protocol TVL snapshot.
 */
export async function computeAndStoreProtocolTVL(
  chainId: number = CHAIN_ID_ETHEREAL
): Promise<{
  vaultTVL: bigint;
  predictionMarketTVL: bigint;
  totalTVL: bigint;
}> {
  console.log(`[ProtocolTVL] Starting TVL computation for chain ${chainId}`);

  // 1. Fetch Vault TVL
  const vaultTVL = await fetchVaultTVL(chainId);
  console.log(`[ProtocolTVL] Vault TVL: ${formatUnits(vaultTVL, 18)} USDe`);

  // 2. Fetch PredictionMarket TVL
  const predictionMarketTVL = await fetchPredictionMarketTVL(chainId);
  console.log(
    `[ProtocolTVL] PredictionMarket TVL: ${formatUnits(predictionMarketTVL, 18)} USDe`
  );

  // 3. Calculate total
  const totalTVL = vaultTVL + predictionMarketTVL;
  console.log(
    `[ProtocolTVL] Total Protocol TVL: ${formatUnits(totalTVL, 18)} USDe`
  );

  // 4. Store snapshot
  await upsertProtocolTVLSnapshot(
    chainId,
    new Date(),
    vaultTVL,
    predictionMarketTVL
  );
  console.log(`[ProtocolTVL] Snapshot stored successfully`);

  return { vaultTVL, predictionMarketTVL, totalTVL };
}

/**
 * Get the latest TVL snapshot for a chain.
 */
export async function getLatestProtocolTVL(
  chainId: number = CHAIN_ID_ETHEREAL
) {
  return prisma.protocolTVLSnapshot.findFirst({
    where: { chainId },
    orderBy: { snapshotDate: 'desc' },
  });
}

/**
 * Get TVL time series for the last N days.
 */
export async function getProtocolTVLTimeSeries(
  chainId: number = CHAIN_ID_ETHEREAL,
  days: number = 90
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return prisma.protocolTVLSnapshot.findMany({
    where: {
      chainId,
      snapshotDate: { gte: startDate },
    },
    orderBy: { snapshotDate: 'asc' },
  });
}
