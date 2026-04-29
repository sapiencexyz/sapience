import { erc20Abi, formatUnits, type Block } from 'viem';
import {
  getProviderForChain,
  resolveBlocksForTimestamps,
} from '../../lib/utils';
import { contracts } from '@sapience/sdk/contracts';
import { predictionMarketVaultAbi } from '@sapience/sdk/abis';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { getConfiguredVaults } from './vaultConfig';
import { sumEscrowBalancesAtBlock, getContractForBlock } from './vaultTvl';
import { buildVaultAggregator } from './vaultAggregator';
import {
  upsertProtocolStatsSnapshot,
  resolveSnapshotIntervalSeconds,
} from './snapshots';
import { GAP_DEBUG, formatGapDecomposition } from './gapDecomposition';
import type { ProtocolStatsData } from './types';

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
const ZERO_SNAPSHOT: ProtocolStatsData = {
  vaultBalance: 0n,
  vaultAvailableAssets: 0n,
  vaultDeployed: 0n,
  escrowBalance: 0n,
  vaultRealizedPnL: 0n,
  vaultAirdropGains: 0n,
  vaultSecondaryBought: 0n,
  vaultSecondarySold: 0n,
  vaultDeposits: 0n,
  vaultWithdrawals: 0n,
  vaultUnredeemedClaim: 0n,
  vaultPositionsWon: 0,
  vaultPositionsLost: 0,
  vaultCollateralWon: 0n,
  vaultCollateralLost: 0n,
};

export async function backfillProtocolStats(
  chainId: number = DEFAULT_CHAIN_ID,
  days: number = 90,
  intervalSeconds?: number
): Promise<void> {
  const client = getProviderForChain(chainId);
  const vaults = getConfiguredVaults(chainId);
  if (vaults.length === 0) {
    console.log(`[ProtocolStats] No vaults configured for chain ${chainId}`);
    return;
  }

  const interval = resolveSnapshotIntervalSeconds(intervalSeconds);

  console.log(
    `[ProtocolStats] Starting backfill for ${days} days on chain ${chainId}, ` +
      `${vaults.length} vault(s): ${vaults.map((v) => `${v.kind}@${v.address}`).join(', ')}, ` +
      `interval ${interval}s, phase1-concurrency ${BACKFILL_BLOCK_RESOLUTION_CONCURRENCY}, ` +
      `phase2-concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY}`
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
    const collateralAddress = contracts.collateralToken[chainId]?.address as
      | `0x${string}`
      | undefined;

    // One-shot pre-fetch of every prediction + flow event the per-iter DB
    // aggregators could ever need across all configured vaults. Replaces
    // (3 findMany) × (V vaults) × (T timestamps) round-trips with O(1) sync
    // calls per iter.
    const tAggBuild = performance.now();
    const aggregator = await buildVaultAggregator(chainId);
    console.log(
      `[ProtocolStats] Phase 2 prep: built in-memory aggregator in ${(performance.now() - tAggBuild).toFixed(0)}ms`
    );

    // Pre-launch zero-fills first — just DB upserts, no RPC. One row per
    // configured vault per pre-launch timestamp.
    if (preLaunch.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2a: upserting ${preLaunch.length} × ${vaults.length} pre-launch zero-fills...`
      );
      const tPreLaunch = performance.now();
      const totalPreUpserts = preLaunch.length * vaults.length;
      const preStep = Math.max(1, Math.floor(totalPreUpserts / 10));
      await runParallelWork(
        preLaunch,
        BACKFILL_SNAPSHOT_CONCURRENCY,
        async (timestamp) => {
          for (const vault of vaults) {
            const t0 = performance.now();
            await upsertProtocolStatsSnapshot(
              timestamp,
              chainId,
              vault.address,
              ZERO_SNAPSHOT
            );
            totals.upsert += performance.now() - t0;
            skipCount++;
            if (skipCount % preStep === 0 || skipCount === totalPreUpserts) {
              console.log(
                `[ProtocolStats] Phase 2a: ${skipCount}/${totalPreUpserts} (${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s)`
              );
            }
          }
        }
      );
      console.log(
        `[ProtocolStats] Phase 2a: done in ${((performance.now() - tPreLaunch) / 1000).toFixed(1)}s`
      );
    }

    // Real on-chain snapshots — fan out per-vault inside each timestamp.
    if (resolved.length > 0) {
      console.log(
        `[ProtocolStats] Phase 2b: fetching on-chain state + DB aggregates for ${resolved.length} timestamps × ${vaults.length} vault(s) (concurrency ${BACKFILL_SNAPSHOT_CONCURRENCY})...`
      );
    }
    const totalRealUpserts = resolved.length * vaults.length;
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

        // Escrow is shared across all vault families on this chain — sum once
        // per (timestamp, block) and reuse across the per-vault loop.
        const tEscrow = performance.now();
        const escrowBalance = await sumEscrowBalancesAtBlock(
          client,
          chainId,
          blockNumber
        );
        let rpcMs = performance.now() - tEscrow;

        for (const vault of vaults) {
          // Pick the vault address that was actually live at this block —
          // handles redeploy boundaries (a since-demoted primary's snapshots
          // for blocks before the new primary's deployment must read from
          // the legacy address, not the current one).
          const vaultAddrAtBlock = getContractForBlock(
            vault.config,
            blockNumber
          );

          if (!vaultAddrAtBlock) {
            // Block predates this vault entirely. Write a zero row so the
            // time series has a continuous backbone instead of gaps.
            const t0 = performance.now();
            await upsertProtocolStatsSnapshot(
              timestamp,
              chainId,
              vault.address,
              { ...ZERO_SNAPSHOT, escrowBalance }
            );
            totals.upsert += performance.now() - t0;
            successCount++;
            doneCount++;
            continue;
          }

          // Two parallel RPC reads pinned to blockNumber. availableAssets()
          // may revert on legacy vault contracts pre-dating that function;
          // fall back to vaultBalance.
          const tRpcVault = performance.now();
          const [vaultBalance, vaultAvailableAssetsOrNull] = await Promise.all([
            collateralAddress
              ? client.readContract({
                  address: collateralAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [vaultAddrAtBlock],
                  blockNumber,
                })
              : Promise.resolve(0n),
            client
              .readContract({
                address: vaultAddrAtBlock,
                abi: predictionMarketVaultAbi,
                functionName: 'availableAssets',
                args: [],
                blockNumber,
              })
              .then((v) => v as bigint)
              .catch(() => null as bigint | null),
          ]);
          rpcMs += performance.now() - tRpcVault;

          const vaultAvailableAssets =
            vaultAvailableAssetsOrNull === null
              ? vaultBalance
              : vaultAvailableAssetsOrNull;

          // DB-derived metrics — sync in-memory aggregation scoped to the
          // historical address (so post-redeploy stats only see prior-deployment
          // predictions on pre-redeploy blocks, fixing the boundary bug).
          const tDb = performance.now();
          const historicalAddrLower = vaultAddrAtBlock.toLowerCase();
          const vaultDeployed = aggregator.deployedAt(
            timestamp,
            historicalAddrLower
          );
          const pnlResult = aggregator.pnlAt(timestamp, historicalAddrLower);
          const flowsResult = aggregator.flowsAt(
            timestamp,
            historicalAddrLower
          );
          const unredeemedClaim = aggregator.unredeemedClaimAt(
            timestamp,
            historicalAddrLower
          );
          const secondaryFlows = aggregator.secondaryAt(
            timestamp,
            historicalAddrLower
          );
          const airdropGains = aggregator.airdropsAt(
            timestamp,
            historicalAddrLower
          );
          totals.dbReads += performance.now() - tDb;

          // Reconciliation identity (1634):
          //   balance + deployed = deposits − withdrawals + settlementPnL
          //                        + (secondarySold − secondaryBought) + airdrops
          const actualTotalAssets = vaultBalance + vaultDeployed;
          const expectedTotalAssets =
            flowsResult.totalDeposits -
            flowsResult.totalWithdrawals +
            pnlResult.realizedPnL +
            secondaryFlows.sold -
            secondaryFlows.bought +
            airdropGains;
          const reconciliationDelta = actualTotalAssets - expectedTotalAssets;
          // See `computeAndStoreProtocolStats` for the rationale on why this
          // stays at log-level rather than error.
          if (reconciliationDelta !== 0n) {
            console.log(
              `[ProtocolStats] reconciliation Δ ≠ 0 for ${vault.kind}@${historicalAddrLower} ts=${timestamp}: Δ=${formatUnits(reconciliationDelta, 18)} USDe ` +
                `(LHS balance+deployed=${formatUnits(actualTotalAssets, 18)} vs RHS=${formatUnits(expectedTotalAssets, 18)})`
            );
          }

          if (GAP_DEBUG()) {
            const decomp = aggregator.gapDecompositionAt(
              timestamp,
              historicalAddrLower
            );
            console.log(
              formatGapDecomposition(
                `ts=${timestamp} ${vault.kind}@${historicalAddrLower}`,
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

          const tUpsert = performance.now();
          // Always upsert under the vault's CURRENT primary address (vault.address)
          // — rows are keyed by vault category, not by historical deployment.
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
          totals.upsert += performance.now() - tUpsert;

          successCount++;
          doneCount++;
        }

        totals.rpcReads += rpcMs;
        const iterMs = performance.now() - iterStart;
        console.log(
          `[ProtocolStats] ${dateStr} block=${blockNumber} [${doneCount}/${totalRealUpserts}] ` +
            `iter=${iterMs.toFixed(0)}ms ` +
            `escrow=${formatUnits(escrowBalance, 18)} ` +
            `(${vaults.length} vault upsert${vaults.length === 1 ? '' : 's'})`
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
    `[ProtocolStats] Backfill ${verdict}: ${successCount} snapshot upserts (across ${vaults.length} vault(s)), ${skipCount} pre-launch zero-fills, ${Math.max(0, postLaunch.length - resolved.length) * vaults.length} skipped in ${(elapsedMs / 1000).toFixed(1)}s\n` +
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
