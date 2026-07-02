/**
 * Query.protocolStats — protocol-wide metrics at the configured snapshot cadence.
 *
 * Each bar's display timestamp is shifted back by one interval so the label
 * reflects "the period/state ending at that label" (a snapshot captured at
 * Mar 5 00:00 UTC = cumulative through end of Mar 4 → rendered under Mar 4).
 * The live candle is anchored to the current interval boundary so the FE sees
 * a continuously-updating in-progress bar that closes when cron fires.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { normalizeLegacyEntry } from '@sapience/sdk/contracts';
import type {
  QueryResolvers,
  ProtocolStat,
  CategoryOpenInterest,
  Category,
  TimeToResolutionBucket,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import {
  calculateVaultAirdrops,
  calculateVaultFlows,
  calculateVaultPnL,
  calculateVaultSecondaryFlows,
  calculateVaultUnredeemedClaim,
  fetchVaultAvailableAssets,
  fetchVaultDeployed,
  fetchVaultTVL,
  getConfiguredVaults,
  getProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds,
  sumEscrowBalancesAtBlock,
} from '../../../../services/protocolStats';
import { getProviderForChain } from '../../../../lib/utils';
import { TtlCache } from '../../../../lib/ttlCache';

import { createLogger } from '../../../../core/logger';

const log = createLogger('graphql.analytics');

interface CumulativeVolumeRow {
  timestamp: bigint;
  cumulative_volume: string | null;
}

interface CumulativeTradeCountRow {
  timestamp: bigint;
  cumulative_trade_count: bigint | number | string | null;
}

interface DailyOIRow {
  timestamp: bigint;
  open_interest: string | null;
}

const buildTimestampMap = <T extends { timestamp: bigint }>(
  rows: T[],
  key: keyof T
): Map<number, string> => {
  const map = new Map<number, string>();
  for (const row of rows) {
    const ts = Number(row.timestamp);
    const value = row[key];
    map.set(ts, value?.toString() || '0');
  }
  return map;
};

export interface ProtocolSeriesAggregates {
  /** boundary ts → cumulative volume (wei, decimal string) as of that ts. */
  volumeMap: Map<number, string>;
  /** boundary ts → cumulative trade count as of that ts. */
  tradeCountMap: Map<number, string>;
  /** boundary ts → open interest (wei, decimal string) live at that ts. */
  oiMap: Map<number, string>;
}

/**
 * Cumulative volume, cumulative trade count, and point-in-time open interest
 * evaluated at each timestamp in `queryTimestamps`.
 *
 * Rewritten from a per-boundary triangular range-join
 * (`UNNEST(boundaries) LEFT JOIN <all events> ON created_ts <= boundary`,
 * roughly O(boundaries × events) — which grew quadratically as both the
 * snapshot count and the event history climbed) into an *as-of running sum*:
 * union the events with the boundary rows, order by `(ts, is_boundary)` so an
 * event landing exactly on a boundary's timestamp sorts *before* that boundary
 * (preserving the old `<=` inclusivity), take a cumulative
 * `SUM() OVER (ROWS UNBOUNDED PRECEDING)`, then read the value off each
 * boundary row. One sort instead of a nested loop — O((events+boundaries)·log).
 *
 * Open interest is a point-in-time "currently open" total, not a monotonic
 * cumulative: each prediction contributes +collateral at creation and
 * −collateral at settlement, so the same running-sum-of-signed-deltas yields
 * `Σ collateral WHERE created ≤ T AND (settled IS NULL OR settled > T)` — the
 * exact predicate the old correlated filter expressed. A prediction settling
 * exactly at boundary T is excluded (its −delta sorts before the boundary),
 * matching the old `settled > T` open condition.
 */
export const fetchProtocolSeriesAggregates = async (
  queryTimestamps: number[],
  chainId: number,
  db: Pick<typeof prisma, '$queryRaw'> = prisma
): Promise<ProtocolSeriesAggregates> => {
  const [cumulativeVolumes, cumulativeTradeCounts, openInterests] =
    await Promise.all([
      db.$queryRaw<CumulativeVolumeRow[]>`
      WITH events AS (
        SELECT "mintedAt" AS ts, CAST("totalCollateral" AS DECIMAL) AS vol
        FROM position
        WHERE "chainId" = ${chainId} AND "mintedAt" IS NOT NULL
        UNION ALL
        SELECT "onChainCreatedAt" AS ts,
          CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol
        FROM "Prediction"
        WHERE "chainId" = ${chainId} AND "onChainCreatedAt" IS NOT NULL
        UNION ALL
        SELECT "executedAt" AS ts, CAST(price AS DECIMAL) AS vol
        FROM secondary_trade
        WHERE "chainId" = ${chainId} AND "executedAt" IS NOT NULL
      ),
      combined AS (
        SELECT ts, vol, 0 AS is_boundary FROM events
        UNION ALL
        SELECT b AS ts, 0::DECIMAL AS vol, 1 AS is_boundary
        FROM UNNEST(${queryTimestamps}::BIGINT[]) AS b
      ),
      running AS (
        SELECT ts, is_boundary,
          SUM(vol) OVER (
            ORDER BY ts, is_boundary
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum
        FROM combined
      )
      SELECT ts AS timestamp, COALESCE(MAX(cum), 0)::TEXT AS cumulative_volume
      FROM running
      WHERE is_boundary = 1
      GROUP BY ts
      ORDER BY ts
    `,
      db.$queryRaw<CumulativeTradeCountRow[]>`
      WITH events AS (
        SELECT "onChainCreatedAt" AS ts
        FROM "Prediction"
        WHERE "chainId" = ${chainId} AND "onChainCreatedAt" IS NOT NULL
        UNION ALL
        SELECT "executedAt" AS ts
        FROM secondary_trade
        WHERE "chainId" = ${chainId} AND "executedAt" IS NOT NULL
      ),
      combined AS (
        SELECT ts, 1::BIGINT AS cnt, 0 AS is_boundary FROM events
        UNION ALL
        SELECT b AS ts, 0::BIGINT AS cnt, 1 AS is_boundary
        FROM UNNEST(${queryTimestamps}::BIGINT[]) AS b
      ),
      running AS (
        SELECT ts, is_boundary,
          SUM(cnt) OVER (
            ORDER BY ts, is_boundary
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum
        FROM combined
      )
      SELECT ts AS timestamp, COALESCE(MAX(cum), 0) AS cumulative_trade_count
      FROM running
      WHERE is_boundary = 1
      GROUP BY ts
      ORDER BY ts
    `,
      db.$queryRaw<DailyOIRow[]>`
      WITH oi_base AS (
        SELECT p."onChainCreatedAt" AS created_ts, pk."resolvedAt" AS settled_ts,
          CAST(p."predictorCollateral" AS DECIMAL) + CAST(p."counterpartyCollateral" AS DECIMAL) AS vol
        FROM "Prediction" p
        LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
        WHERE p."chainId" = ${chainId} AND p."onChainCreatedAt" IS NOT NULL
      ),
      deltas AS (
        -- +collateral when the prediction is created …
        SELECT created_ts AS ts, vol FROM oi_base
        UNION ALL
        -- … −collateral once it settles (open interest is released).
        SELECT settled_ts AS ts, -vol AS vol FROM oi_base WHERE settled_ts IS NOT NULL
      ),
      combined AS (
        SELECT ts, vol, 0 AS is_boundary FROM deltas
        UNION ALL
        SELECT b AS ts, 0::DECIMAL AS vol, 1 AS is_boundary
        FROM UNNEST(${queryTimestamps}::BIGINT[]) AS b
      ),
      running AS (
        SELECT ts, is_boundary,
          SUM(vol) OVER (
            ORDER BY ts, is_boundary
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cum
        FROM combined
      )
      SELECT ts AS timestamp, COALESCE(MAX(cum), 0)::TEXT AS open_interest
      FROM running
      WHERE is_boundary = 1
      GROUP BY ts
      ORDER BY ts
    `,
    ]);

  return {
    volumeMap: buildTimestampMap(cumulativeVolumes, 'cumulative_volume'),
    tradeCountMap: buildTimestampMap(
      cumulativeTradeCounts,
      'cumulative_trade_count'
    ),
    oiMap: buildTimestampMap(openInterests, 'open_interest'),
  };
};

const computeProtocolStats = async (
  vaultAddressArg: string | null | undefined
): Promise<ProtocolStat[]> => {
  const chainId = DEFAULT_CHAIN_ID;

  // Resolve which vault category the caller wants. Without `vaultAddressArg`
  // we default to the protocol vault (preserves the legacy single-tab default).
  // With it, match against any configured vault's current primary OR any of
  // its legacy entries, so an explicit "give me the pyth tab" pin still works
  // after a future pyth redeploy demotes the address into legacy.
  const configuredVaults = getConfiguredVaults(chainId);
  const targetArgLower = vaultAddressArg?.toLowerCase();
  const targetVault = targetArgLower
    ? configuredVaults.find(
        (v) =>
          v.address === targetArgLower ||
          (v.config.legacy ?? []).some(
            (le) =>
              normalizeLegacyEntry(le).address.toLowerCase() === targetArgLower
          )
      )
    : configuredVaults.find((v) => v.kind === 'protocol');
  const vaultConfig = targetVault?.config;

  // An explicit vaultAddress that doesn't map to any configured vault family
  // should yield no rows, not silently fall back to the unfiltered all-vault
  // series. The empty-array sentinel below means "no matched addresses", while
  // an omitted argument still uses the default protocol vault family.
  if (vaultAddressArg && !targetVault) {
    return [];
  }

  // Filter the snapshot time series by the full address history of the chosen
  // vault — current primary plus every demoted-to-legacy address. Without
  // the legacies, every SDK redeploy would orphan the entire historical chart
  // until a re-stamping backfill runs. Per-category by construction: the
  // address set only contains entries for the SELECTED vault family, so
  // protocol/pyth/single-leg/strategy-b rows never bleed across each other.
  const vaultAddresses: string[] = vaultConfig
    ? [
        vaultConfig.address,
        ...(vaultConfig.legacy ?? []).map(
          (le) => normalizeLegacyEntry(le).address
        ),
      ].map((a) => a.toLowerCase())
    : [];

  const rawSnapshots = await getProtocolStatsTimeSeries(
    undefined,
    chainId,
    vaultAddresses
  );
  if (rawSnapshots.length === 0) {
    return [];
  }

  // Dedupe by timestamp: a single day can have rows under multiple addresses
  // (current primary + a since-demoted legacy that prod's older cron wrote).
  // Without dedup, queryTimestamps below would contain duplicates, which
  // breaks the cumulativeVolume SQL — UNNEST + LEFT JOIN + GROUP BY ends up
  // multiplying the per-day volume by the number of duplicate rows, producing
  // step-up cumVols that go *backwards* on days with fewer duplicates →
  // negative periodVolume.
  //
  // Preference order when multiple rows share a timestamp: the row stamped
  // under the current primary wins (matches what the post-redeploy backfill
  // writes); otherwise keep whatever was there.
  const currentPrimary = vaultConfig?.address.toLowerCase();
  const dedup = new Map<number, (typeof rawSnapshots)[number]>();
  for (const s of rawSnapshots) {
    const existing = dedup.get(s.timestamp);
    if (
      !existing ||
      (currentPrimary && s.vaultAddress.toLowerCase() === currentPrimary)
    ) {
      dedup.set(s.timestamp, s);
    }
  }
  const protocolSnapshots = [...dedup.values()].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const queryTimestamps = [...snapshotTimestamps, nowTimestamp];

  const { volumeMap, tradeCountMap, oiMap } =
    await fetchProtocolSeriesAggregates(queryTimestamps, chainId);

  // Display each bar one interval *before* the snapshot's capture timestamp
  // so the label reflects "the period/state represented" rather than "the
  // moment of measurement".
  const interval = resolveSnapshotIntervalSeconds();

  // Cumulative PnL surfaced to the chart rolls up trading activity:
  // settlement PnL, plus wUSDe already earmarked for the vault from
  // resolved-but-not-yet-redeemed wins, plus net secondary-market trade flow.
  //
  // `vaultRealizedPnL` is `grossPayouts(Claim ∪ Close) − primaryCollateral`:
  // the cost basis (`primaryCollateral`) is recognized the moment a pickConfig
  // resolves, but the payout only lands once the holder's `redeem()`/`burn()`
  // is indexed. Between those two events a winning position contributes
  // `−stake` instead of `+profit` — a transient phantom loss that crashed the
  // PnL chart on days when a chunk of the vault's positions resolved before the
  // keeper's `redeemFromEscrow` tx was indexed. `vaultUnredeemedClaim` (= total
  // collateral owed on the vault's winning sides, net of what it's already
  // claimed) exactly cancels that gap, so the line stays stable across the
  // resolve → redeem → index cycle. Airdrops are tracked separately so they can
  // be reported alongside without distorting the trading return shown here.
  const cumulativePnL = (s: (typeof protocolSnapshots)[number]): bigint =>
    BigInt(s.vaultRealizedPnL) +
    BigInt(s.vaultUnredeemedClaim) +
    BigInt(s.vaultSecondarySold) -
    BigInt(s.vaultSecondaryBought);

  const results: ProtocolStat[] = protocolSnapshots.map((snapshot, i) => {
    const cumVol = volumeMap.get(snapshot.timestamp) || '0';
    const prevCumVol =
      i > 0 ? volumeMap.get(protocolSnapshots[i - 1].timestamp) || '0' : '0';
    const periodVolume = (BigInt(cumVol) - BigInt(prevCumVol)).toString();

    const cumTradeCount = Number(tradeCountMap.get(snapshot.timestamp) || '0');
    const prevCumTradeCount =
      i > 0
        ? Number(tradeCountMap.get(protocolSnapshots[i - 1].timestamp) || '0')
        : 0;
    const periodTradeCount = cumTradeCount - prevCumTradeCount;

    const cumPnL = cumulativePnL(snapshot);
    const prevCumPnL = i > 0 ? cumulativePnL(protocolSnapshots[i - 1]) : 0n;
    const periodPnL = (cumPnL - prevCumPnL).toString();

    return {
      timestamp: snapshot.timestamp - interval,
      cumulativeVolume: cumVol,
      totalTradeCount: cumTradeCount,
      periodTradeCount,
      openInterest: oiMap.get(snapshot.timestamp) || '0',
      vaultBalance: snapshot.vaultBalance,
      vaultAvailableAssets: snapshot.vaultAvailableAssets,
      vaultDeployed: snapshot.vaultDeployed,
      escrowBalance: snapshot.escrowBalance,
      vaultCumulativePnL: cumPnL.toString(),
      vaultPositionsWon: snapshot.vaultPositionsWon,
      vaultPositionsLost: snapshot.vaultPositionsLost,
      vaultDeposits: snapshot.vaultDeposits,
      vaultWithdrawals: snapshot.vaultWithdrawals,
      vaultAirdropGains: snapshot.vaultAirdropGains,
      vaultSecondaryBought: snapshot.vaultSecondaryBought,
      vaultSecondarySold: snapshot.vaultSecondarySold,
      vaultUnredeemedClaim: snapshot.vaultUnredeemedClaim,
      periodPnL,
      periodVolume,
    };
  });

  try {
    const lastSnapshot = protocolSnapshots[protocolSnapshots.length - 1];
    const lastCumVol = volumeMap.get(lastSnapshot.timestamp) || '0';
    const liveCumVol = volumeMap.get(nowTimestamp) || lastCumVol;
    const livePeriodVolume = (
      BigInt(liveCumVol) - BigInt(lastCumVol)
    ).toString();
    const lastTradeCount = Number(
      tradeCountMap.get(lastSnapshot.timestamp) || '0'
    );
    const liveTradeCount = Number(
      tradeCountMap.get(nowTimestamp) || lastTradeCount
    );
    const livePeriodTradeCount = liveTradeCount - lastTradeCount;

    // Scope all per-vault helpers to the SELECTED vault category. Without this
    // the live candle on the Pyth/SingleLeg/StrategyB tabs would silently render
    // protocol-vault numbers, since these helpers default to the protocol
    // primary when no vaultAddress arg is passed. Escrow stays chain-scoped —
    // it's shared across all vault families on the chain.
    const liveVaultAddress = vaultConfig?.address.toLowerCase();
    const [
      liveVaultBalance,
      liveVaultAvailableAssets,
      liveVaultDeployed,
      liveEscrowBalance,
      livePnlResult,
      liveFlowsResult,
      liveSecondaryFlows,
      liveAirdropGains,
      liveUnredeemedClaim,
    ] = await Promise.all([
      fetchVaultTVL(chainId, liveVaultAddress),
      fetchVaultAvailableAssets(chainId, liveVaultAddress),
      fetchVaultDeployed(chainId, undefined, liveVaultAddress),
      sumEscrowBalancesAtBlock(getProviderForChain(chainId), chainId),
      calculateVaultPnL(chainId, undefined, liveVaultAddress),
      calculateVaultFlows(chainId, undefined, liveVaultAddress),
      calculateVaultSecondaryFlows(chainId, undefined, liveVaultAddress),
      calculateVaultAirdrops(chainId, undefined, liveVaultAddress),
      calculateVaultUnredeemedClaim(chainId, undefined, liveVaultAddress),
    ]);

    const liveCumulativePnL =
      livePnlResult.realizedPnL +
      liveUnredeemedClaim +
      liveSecondaryFlows.sold -
      liveSecondaryFlows.bought;
    const livePeriodPnL = (
      liveCumulativePnL - cumulativePnL(lastSnapshot)
    ).toString();

    // Live candle = current in-progress period; label at start of current
    // interval (matches the display shift for closed bars).
    const currentBoundary = Math.floor(Date.now() / 1000 / interval) * interval;

    results.push({
      timestamp: currentBoundary,
      cumulativeVolume: liveCumVol,
      totalTradeCount: liveTradeCount,
      periodTradeCount: livePeriodTradeCount,
      openInterest: oiMap.get(nowTimestamp) || '0',
      vaultBalance: liveVaultBalance.toString(),
      vaultAvailableAssets: liveVaultAvailableAssets.toString(),
      vaultDeployed: liveVaultDeployed.toString(),
      escrowBalance: liveEscrowBalance.toString(),
      vaultCumulativePnL: liveCumulativePnL.toString(),
      vaultPositionsWon: livePnlResult.positionsWon,
      vaultPositionsLost: livePnlResult.positionsLost,
      vaultDeposits: liveFlowsResult.totalDeposits.toString(),
      vaultWithdrawals: liveFlowsResult.totalWithdrawals.toString(),
      vaultAirdropGains: liveAirdropGains.toString(),
      vaultSecondaryBought: liveSecondaryFlows.bought.toString(),
      vaultSecondarySold: liveSecondaryFlows.sold.toString(),
      vaultUnredeemedClaim: liveUnredeemedClaim.toString(),
      periodPnL: livePeriodPnL,
      periodVolume: livePeriodVolume,
    });
  } catch (err) {
    log.error(
      { err: err },
      '[protocolStats] live candle failed, falling back to snapshots only:'
    );
  }

  return results;
};

const PROTOCOL_STATS_TTL_MS = 60_000;

// Keyed by the requested vault family ('__default__' = the protocol family,
// which is what the analytics page asks for). The value is the in-flight
// promise, not the resolved array, so concurrent callers single-flight onto
// one computation: the analytics dashboard fires `stats` and `statsHistory`
// (sibling resolvers, evaluated concurrently) plus up to ~50 sequential
// history-pagination requests, and every one re-runs this whole pipeline
// (3 series queries + the live candle's on-chain RPC) with no dependence on
// the page/cursor. Collapsing them to one DB+RPC pass per TTL window is the
// dominant win for the dashboard's load time.
const protocolStatsCache = new TtlCache<string, Promise<ProtocolStat[]>>({
  ttlMs: PROTOCOL_STATS_TTL_MS,
});

/** Test hook — drop all memoized protocol-stats entries. */
export const __clearProtocolStatsCache = (): void => {
  protocolStatsCache.clear();
};

export const getProtocolStatsCacheStats = (): {
  size: number;
  live: number;
} => ({
  size: protocolStatsCache.size(),
  live: protocolStatsCache.liveSize(),
});

export const protocolStats: NonNullable<QueryResolvers['protocolStats']> = (
  _parent,
  { vaultAddress: vaultAddressArg }
) => {
  const key = vaultAddressArg ? vaultAddressArg.toLowerCase() : '__default__';
  const hit = protocolStatsCache.get(key);
  if (hit) return hit;

  // Don't cache rejections: evict on failure so a transient RPC/DB blip isn't
  // pinned as the answer for the whole TTL window (the next caller retries).
  const promise = computeProtocolStats(vaultAddressArg).catch((err) => {
    protocolStatsCache.delete(key);
    throw err;
  });
  protocolStatsCache.set(key, promise);
  return promise;
};

interface CategoryOpenInterestRow {
  category_id: number;
  category_name: string;
  category_slug: string;
  category_created_at: Date;
  total_oi: string;
}

/**
 * Tiny TTL memo for argument-less resolvers. Single-flight on cache miss so
 * a thundering herd collapses to one DB hit.
 */
const memoTtl = <T>(
  fn: () => Promise<T>,
  ttlMs: number
): (() => Promise<T>) => {
  let cached: { value: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;
  return async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const value = await fn();
        cached = { value, expiresAt: Date.now() + ttlMs };
        return value;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };
};

const ANALYTICS_CACHE_TTL_MS = 60_000;

/**
 * Query.openInterestByCategory — protocol-wide open interest aggregated by
 * category for the configured chain.
 *
 * Aggregates per-condition `openInterest` directly (rather than reading
 * `condition_group.totalOpenInterest`) so the chainId filter applies cleanly.
 * Math is equivalent: the denormalized group total is a sum of its
 * conditions' OI, so summing condition rows produces the same per-category
 * total. Counts private conditions too so this breakdown reconciles with the
 * protocol-wide OI total.
 *
 * Cached in-process for 60s — single-flighted, so concurrent requests
 * collapse to one DB hit and the result feeds the public CDN as well.
 */
const fetchOpenInterestByCategory = memoTtl(
  async (): Promise<CategoryOpenInterest[]> => {
    const chainId = DEFAULT_CHAIN_ID;
    const rows = await prisma.$queryRaw<CategoryOpenInterestRow[]>`
    SELECT
      cat.id AS category_id,
      cat.name AS category_name,
      cat.slug AS category_slug,
      cat."createdAt" AS category_created_at,
      SUM(c."openInterest"::numeric)::text AS total_oi
    FROM condition c
    INNER JOIN category cat ON cat.id = c."categoryId"
    WHERE c.settled = false
      AND c."chainId" = ${chainId}
    GROUP BY cat.id, cat.name, cat.slug, cat."createdAt"
    HAVING SUM(c."openInterest"::numeric) > 0
    ORDER BY SUM(c."openInterest"::numeric) DESC
  `;

    return rows.map((row) => ({
      // Category field resolvers (conditions/conditionGroups) only read parent.id,
      // so a partial row satisfies them — no need to load relations eagerly.
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        createdAt: row.category_created_at,
      } as unknown as Category,
      openInterest: row.total_oi,
    }));
  },
  ANALYTICS_CACHE_TTL_MS
);

export const openInterestByCategory: NonNullable<
  QueryResolvers['openInterestByCategory']
> = () => fetchOpenInterestByCategory();

interface TimeToResolutionRow {
  bucket: number;
  total_oi: string;
  prediction_count: bigint;
}

const TTR_BUCKET_LABELS: Record<number, string> = {
  1: '≤1d',
  2: '2-7d',
  3: '8-30d',
  4: '1-2mo',
  5: '2-3mo',
  6: '3-6mo',
  7: '6mo+',
};

/**
 * Query.openInterestByTimeToResolution — protocol-wide OI bucketed by how soon
 * each prediction's collateral can finally be claimed. Pre-aggregates each
 * pickConfig once (max endTime across legs), then joins predictions in a
 * single pass — avoiding the Pick × condition fan-out that the obvious join
 * would create. Predictions whose latest endTime is in the past but haven't
 * been resolved roll into bucket 1 (imminent / overdue).
 *
 * Counts OI on private conditions too — collateral locked in a privated
 * condition is still real protocol OI that someone can eventually claim, so
 * these totals reconcile with the OI time-series resolver. The CTE pre-filters
 * Pick rows by condition.chainId so the per-pickConfig aggregation only walks
 * rows for the target chain (Pick legs are co-chain with their pickConfig in
 * practice). Cached in-process for 60s with single-flight.
 */
const fetchOpenInterestByTimeToResolution = memoTtl(
  async (): Promise<TimeToResolutionBucket[]> => {
    const chainId = DEFAULT_CHAIN_ID;
    const rows = await prisma.$queryRaw<TimeToResolutionRow[]>`
    WITH per_pick_config AS (
      SELECT
        pi."pickConfigId" AS pick_config_id,
        MAX(c."endTime")  AS max_end_time
      FROM "Pick" pi
      JOIN "condition" c ON c.id = pi."conditionId"
      WHERE c."chainId" = ${chainId}
      GROUP BY pi."pickConfigId"
    )
    SELECT
      -- Bucket boundaries (1d/7d/30d/60d/90d/180d) are mirrored in v2's
      -- TTR_BUCKET_BOUNDS map (graphql/v2/resolvers/Protocol.ts), which
      -- decodes these ordinals into seconds-from-now ranges. Change both
      -- together, or the v2 min/maxSecondsFromNow will misreport.
      CASE
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 86400 THEN 1
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 7 * 86400 THEN 2
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 30 * 86400 THEN 3
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 60 * 86400 THEN 4
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 90 * 86400 THEN 5
        WHEN (x.max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 180 * 86400 THEN 6
        ELSE 7
      END AS bucket,
      SUM(
        CAST(p."predictorCollateral" AS numeric) +
        CAST(p."counterpartyCollateral" AS numeric)
      )::text AS total_oi,
      COUNT(*)::bigint AS prediction_count
    FROM "Prediction" p
    JOIN "Picks" pk ON pk.id = p."pickConfigId"
    JOIN per_pick_config x ON x.pick_config_id = pk.id
    WHERE pk.resolved = false
      AND pk."chainId" = ${chainId}
    GROUP BY bucket
    ORDER BY bucket
  `;

    return rows.map((row) => ({
      bucket: row.bucket,
      label: TTR_BUCKET_LABELS[row.bucket] ?? String(row.bucket),
      openInterest: row.total_oi,
      predictionCount: Number(row.prediction_count),
    }));
  },
  ANALYTICS_CACHE_TTL_MS
);

export const openInterestByTimeToResolution: NonNullable<
  QueryResolvers['openInterestByTimeToResolution']
> = () => fetchOpenInterestByTimeToResolution();
