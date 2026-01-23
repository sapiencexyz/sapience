import { erc20Abi, formatUnits } from 'viem';
import prisma from '../db';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
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
 * Fetch Vault TVL at a specific block number (for historical queries).
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

  const totalDeployed = (await client.readContract({
    address: vaultAddress,
    abi: liquidityVaultAbi,
    functionName: 'totalDeployed',
    args: [],
    blockNumber,
  })) as bigint;

  return wUsdeBalance + totalDeployed;
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
 * Get UTC midnight timestamp for a given date.
 */
function getUtcMidnightTimestamp(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000
  );
}

/**
 * Create or update daily stats snapshot.
 */
export async function upsertProtocolStatsSnapshot(
  chainId: number,
  snapshotTimestamp: number,
  vaultTVL: bigint,
  predictionMarketTVL: bigint
): Promise<void> {
  await prisma.protocolStatsSnapshot.upsert({
    where: {
      snapshotTimestamp_chainId: {
        snapshotTimestamp,
        chainId,
      },
    },
    create: {
      snapshotTimestamp,
      chainId,
      vaultTVL: vaultTVL.toString(),
      predictionMarketTVL: predictionMarketTVL.toString(),
    },
    update: {
      vaultTVL: vaultTVL.toString(),
      predictionMarketTVL: predictionMarketTVL.toString(),
    },
  });
}

/**
 * Main function to compute and store daily Protocol stats snapshot.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = CHAIN_ID_ETHEREAL
): Promise<{
  vaultTVL: bigint;
  predictionMarketTVL: bigint;
  totalTVL: bigint;
}> {
  console.log(
    `[ProtocolStats] Starting stats computation for chain ${chainId}`
  );

  // 1. Fetch Vault TVL
  const vaultTVL = await fetchVaultTVL(chainId);
  console.log(`[ProtocolStats] Vault TVL: ${formatUnits(vaultTVL, 18)} USDe`);

  // 2. Fetch PredictionMarket TVL
  const predictionMarketTVL = await fetchPredictionMarketTVL(chainId);
  console.log(
    `[ProtocolStats] PredictionMarket TVL: ${formatUnits(predictionMarketTVL, 18)} USDe`
  );

  // 3. Calculate total
  const totalTVL = vaultTVL + predictionMarketTVL;
  console.log(
    `[ProtocolStats] Total Protocol TVL: ${formatUnits(totalTVL, 18)} USDe`
  );

  // 4. Store snapshot with today's UTC midnight timestamp
  const snapshotTimestamp = getUtcMidnightTimestamp(new Date());
  await upsertProtocolStatsSnapshot(
    chainId,
    snapshotTimestamp,
    vaultTVL,
    predictionMarketTVL
  );
  console.log(`[ProtocolStats] Snapshot stored successfully`);

  return { vaultTVL, predictionMarketTVL, totalTVL };
}

/**
 * Get the latest stats snapshot for a chain.
 */
export async function getLatestProtocolStats(
  chainId: number = CHAIN_ID_ETHEREAL
) {
  return prisma.protocolStatsSnapshot.findFirst({
    where: { chainId },
    orderBy: { snapshotTimestamp: 'desc' },
  });
}

/**
 * Get stats time series for the last N days.
 */
export async function getProtocolStatsTimeSeries(
  chainId: number = CHAIN_ID_ETHEREAL,
  days: number = 90
) {
  const startTimestamp = getUtcMidnightTimestamp(new Date()) - days * 86400;

  return prisma.protocolStatsSnapshot.findMany({
    where: {
      chainId,
      snapshotTimestamp: { gte: startTimestamp },
    },
    orderBy: { snapshotTimestamp: 'asc' },
  });
}

/**
 * Backfill historical Protocol stats by querying on-chain state at past blocks.
 * Requires archive node support for historical state queries.
 */
export async function backfillProtocolStats(
  chainId: number = CHAIN_ID_ETHEREAL,
  days: number = 90
): Promise<void> {
  const client = getProviderForChain(chainId);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}`
  );

  // Generate list of timestamps to backfill (UTC midnight)
  const todayMidnight = getUtcMidnightTimestamp(new Date());
  const timestamps: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    timestamps.push(todayMidnight - i * 86400);
  }

  let successCount = 0;
  let skipCount = 0;

  for (let idx = 0; idx < timestamps.length; idx++) {
    const snapshotTimestamp = timestamps[idx];
    const dateStr = new Date(snapshotTimestamp * 1000)
      .toISOString()
      .split('T')[0];

    // Find block at this timestamp using binary search
    const block = await getBlockByTimestamp(client, snapshotTimestamp);
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
      // Query historical TVL
      const vaultTVL = await fetchVaultTVLAtBlock(chainId, blockNumber);
      const predictionMarketTVL = await fetchPredictionMarketTVLAtBlock(
        chainId,
        blockNumber
      );

      // Store snapshot (upsert handles existing records)
      await upsertProtocolStatsSnapshot(
        chainId,
        snapshotTimestamp,
        vaultTVL,
        predictionMarketTVL
      );

      console.log(
        `[ProtocolStats]   Vault: ${formatUnits(vaultTVL, 18)}, PM: ${formatUnits(predictionMarketTVL, 18)}`
      );
      successCount++;
    } catch (error) {
      // Contract may not have existed at this block - skip and continue
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
        // Re-throw unexpected errors
        throw error;
      }
    }

    // Rate limit: 100ms delay between days
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(
    `[ProtocolStats] Backfill complete: ${successCount} days processed, ${skipCount} skipped`
  );
}
