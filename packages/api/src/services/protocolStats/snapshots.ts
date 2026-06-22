import { erc20Abi, formatUnits } from 'viem';
import { contracts } from '@sapience/sdk/contracts';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import prisma from '../../core/db';
import { getProviderForChain, getBlockByTimestamp } from '../../lib/utils';
import { createLogger } from '../../core/logger';
import { getConfiguredVaults } from './vaultConfig';
import {
  sumEscrowBalancesAtBlock,
  fetchVaultDeployedAtBlock,
  getContractForBlock,
} from './vaultTvl';
import {
  calculateVaultPnL,
  calculateVaultFlows,
  calculateVaultSecondaryFlows,
  computeAirdropResidual,
} from './vaultPnL';
import { calculateVaultUnredeemedClaim } from './vaultUnredeemed';
import {
  GAP_DEBUG,
  decomposeVaultGap,
  formatGapDecomposition,
} from './gapDecomposition';
import type { ProtocolStatsData } from './types';

const log = createLogger('services.protocolStats.snapshots');

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
export async function upsertProtocolStatsSnapshot(
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
      vaultSecondaryBought: data.vaultSecondaryBought.toString(),
      vaultSecondarySold: data.vaultSecondarySold.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
      vaultUnredeemedClaim: data.vaultUnredeemedClaim.toString(),
    },
    update: {
      vaultBalance: data.vaultBalance.toString(),
      vaultAvailableAssets: data.vaultAvailableAssets.toString(),
      vaultDeployed: data.vaultDeployed.toString(),
      escrowBalance: data.escrowBalance.toString(),
      vaultRealizedPnL: data.vaultRealizedPnL.toString(),
      vaultAirdropGains: data.vaultAirdropGains.toString(),
      vaultSecondaryBought: data.vaultSecondaryBought.toString(),
      vaultSecondarySold: data.vaultSecondarySold.toString(),
      vaultDeposits: data.vaultDeposits.toString(),
      vaultWithdrawals: data.vaultWithdrawals.toString(),
      vaultPositionsWon: data.vaultPositionsWon,
      vaultPositionsLost: data.vaultPositionsLost,
      vaultCollateralWon: data.vaultCollateralWon.toString(),
      vaultCollateralLost: data.vaultCollateralLost.toString(),
      vaultUnredeemedClaim: data.vaultUnredeemedClaim.toString(),
    },
  });
}

export const DEFAULT_SNAPSHOT_INTERVAL_SECONDS = 86400;

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
 * Main function to compute and store protocol stats snapshots, one row per
 * configured vault on the chain.
 *
 * The snapshot timestamp is floored to the configured interval so bars line
 * up on predictable boundaries regardless of exactly when the cron fires.
 * Block resolution + escrow summation happen ONCE per call (chain-scoped);
 * everything inside the per-vault loop scopes to that vault.
 */
export async function computeAndStoreProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    log.info(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  log.info(
    `[ProtocolStats] Starting stats computation for chain ${chainId}, ` +
      `${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}, ` +
      `interval ${interval}s`
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
  log.info(
    `[ProtocolStats] Resolved block ${blockNumber} for timestamp ${timestamp} (block ts=${targetBlock.timestamp})`
  );

  const collateralAddress = contracts.collateralToken[chainId]?.address as
    | `0x${string}`
    | undefined;

  // Escrow is chain-wide (shared across all vault families on this chain), so
  // sum it once and attach the same value to every per-vault snapshot.
  const escrowBalance = await sumEscrowBalancesAtBlock(
    client,
    chainId,
    blockNumber
  );
  log.info(
    `[ProtocolStats] Escrow: ${formatUnits(escrowBalance, 18)} USDe (V2 primary + past deploys)`
  );

  for (const vault of vaults) {
    // Pick historically-correct vault address for this block — handles vault
    // migrations via `getContractForBlock`.
    const vaultAddr = getContractForBlock(vault.config, blockNumber);

    // On-chain reads pinned to `blockNumber` in parallel. availableAssets()
    // may revert on older vault contracts pre-dating that function — catch
    // and fall through to vaultBalance.
    const [vaultBalance, vaultAvailableAssetsOrNull] = await Promise.all([
      vaultAddr && collateralAddress
        ? client.readContract({
            address: collateralAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [vaultAddr],
            blockNumber,
          })
        : Promise.resolve(0n),
      vaultAddr
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
    ]);

    const vaultAvailableAssets =
      vaultAvailableAssetsOrNull === null
        ? vaultBalance
        : vaultAvailableAssetsOrNull;

    // DB-derived aggregates scoped to this vault — same snapshot timestamp.
    // Note: `calculateVaultUnredeemedClaim` runs after the main Promise.all so
    // its prediction.findMany calls don't interleave with fetchVaultDeployed /
    // calculateVaultPnL (which both query Prediction in a specific order the
    // cron-path tests rely on).
    const [vaultDeployed, pnlResult, flowsResult, secondaryFlows] =
      await Promise.all([
        fetchVaultDeployedAtBlock(
          chainId,
          blockNumber,
          timestamp,
          vault.address
        ),
        calculateVaultPnL(chainId, timestamp, vault.address),
        calculateVaultFlows(chainId, timestamp, vault.address),
        calculateVaultSecondaryFlows(chainId, timestamp, vault.address),
      ]);
    const unredeemedClaim = await calculateVaultUnredeemedClaim(
      chainId,
      timestamp,
      vault.address
    );

    // Airdrops = the unexplained part of the vault's true on-chain AUM
    // (direct donations auto-distributed pro-rata to LPs). Derived as the
    // residual of the reconciliation identity below.
    const airdropGains = computeAirdropResidual({
      vaultBalance,
      vaultDeployed,
      totalDeposits: flowsResult.totalDeposits,
      totalWithdrawals: flowsResult.totalWithdrawals,
      realizedPnL: pnlResult.realizedPnL,
      secondarySold: secondaryFlows.sold,
      secondaryBought: secondaryFlows.bought,
    });

    // Reconciliation identity:
    //   balance + deployed
    //     = deposits - withdrawals
    //     + settlementPnL  (Close-based)
    //     + secondarySold - secondaryBought
    //     + airdrops       (balance residual; 0 unless AUM is over-explained)
    const actualTotalAssets = vaultBalance + vaultDeployed;
    const expectedTotalAssets =
      flowsResult.totalDeposits -
      flowsResult.totalWithdrawals +
      pnlResult.realizedPnL +
      secondaryFlows.sold -
      secondaryFlows.bought +
      airdropGains;
    const reconciliationDelta = actualTotalAssets - expectedTotalAssets;

    log.info(
      `[ProtocolStats] ${vault.kind}@${vault.address}: ` +
        `balance=${formatUnits(vaultBalance, 18)}, available=${formatUnits(vaultAvailableAssets, 18)}, ` +
        `deployed=${formatUnits(vaultDeployed, 18)}, unredeemed=${formatUnits(unredeemedClaim, 18)}, ` +
        `pnl=${formatUnits(pnlResult.realizedPnL, 18)} ` +
        `(won ${pnlResult.positionsWon}/lost ${pnlResult.positionsLost}), ` +
        `flows=+${formatUnits(flowsResult.totalDeposits, 18)}/-${formatUnits(flowsResult.totalWithdrawals, 18)}, ` +
        `secondary=+${formatUnits(secondaryFlows.sold, 18)}/-${formatUnits(secondaryFlows.bought, 18)}, ` +
        `airdrop=${formatUnits(airdropGains, 18)}, ` +
        `reconciliation Δ=${formatUnits(reconciliationDelta, 18)}`
    );

    // Airdrops absorb any positive residual, so a non-zero Δ here means the
    // identity is OVER-explained: deposits − withdrawals + pnl + (sold −
    // bought) exceeds the true on-chain balance + deployed. That points to an
    // accounting leg over-counting (e.g. stale/duplicated VaultFlowEvent
    // deposits, or a settlement leg double-counted) and is a real bug signal.
    // Logged at info-level rather than error because cumulative-balance drift
    // persists across every subsequent snapshot — making it loud causes alert
    // fatigue rather than action.
    if (reconciliationDelta !== 0n) {
      log.info(
        `[ProtocolStats] reconciliation Δ ≠ 0 for ${vault.kind}@${vault.address} ts=${timestamp}: Δ=${formatUnits(reconciliationDelta, 18)} USDe ` +
          `(LHS balance+deployed=${formatUnits(actualTotalAssets, 18)} vs RHS=${formatUnits(expectedTotalAssets, 18)})`
      );
    }

    if (GAP_DEBUG()) {
      const decomp = await decomposeVaultGap(chainId, timestamp, vault.address);
      log.info(
        formatGapDecomposition(
          `ts=${timestamp} ${vault.kind}@${vault.address}`,
          decomp,
          vaultBalance,
          vaultDeployed,
          flowsResult.totalDeposits,
          flowsResult.totalWithdrawals,
          pnlResult.realizedPnL,
          secondaryFlows,
          airdropGains
        )
      );
    }

    await upsertProtocolStatsSnapshot(timestamp, chainId, vault.address, {
      vaultBalance,
      vaultAvailableAssets,
      vaultDeployed,
      escrowBalance,
      vaultRealizedPnL: pnlResult.realizedPnL,
      vaultAirdropGains: airdropGains,
      vaultSecondaryBought: secondaryFlows.bought,
      vaultSecondarySold: secondaryFlows.sold,
      vaultDeposits: flowsResult.totalDeposits,
      vaultWithdrawals: flowsResult.totalWithdrawals,
      vaultPositionsWon: pnlResult.positionsWon,
      vaultPositionsLost: pnlResult.positionsLost,
      vaultCollateralWon: pnlResult.totalCollateralWon,
      vaultCollateralLost: pnlResult.totalCollateralLost,
      vaultUnredeemedClaim: unredeemedClaim,
    });
  }

  log.info(
    `[ProtocolStats] Snapshots stored: ${vaults.length} row(s) at ts=${timestamp}`
  );
}

/**
 * Get stats time series. If `days` is provided, limits to the last N days.
 * If omitted, returns all available snapshots.
 *
 * `vaultAddress` may be a single address or an array. Passing an array enables
 * the caller to include historical primaries (current SDK primary plus its
 * `legacy[]` chain) so the time series stays continuous across vault redeploys
 * — without an array, rows written under a since-demoted primary would be
 * orphaned by the equality filter.
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

export async function getProtocolStatsTimeSeries(
  days?: number,
  chainId: number = DEFAULT_CHAIN_ID,
  vaultAddress?: string | readonly string[]
) {
  const vaultFilter = (() => {
    if (!vaultAddress) return {};
    if (Array.isArray(vaultAddress)) {
      if (vaultAddress.length === 0) return {};
      if (vaultAddress.length === 1) return { vaultAddress: vaultAddress[0] };
      return { vaultAddress: { in: vaultAddress as string[] } };
    }
    return { vaultAddress: vaultAddress as string };
  })();

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
      ...vaultFilter,
    },
    orderBy: { timestamp: 'asc' },
  });
}
