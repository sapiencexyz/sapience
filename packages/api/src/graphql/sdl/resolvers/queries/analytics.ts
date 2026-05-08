/**
 * Query.protocolStats — protocol-wide metrics at the configured snapshot cadence.
 *
 * Each bar's display timestamp is shifted back by one interval so the label
 * reflects "the period/state ending at that label" (a snapshot captured at
 * Mar 5 00:00 UTC = cumulative through end of Mar 4 → rendered under Mar 4).
 * The live candle is anchored to the current interval boundary so the FE sees
 * a continuously-updating in-progress bar that closes when cron fires.
 *
 * The resolver is split into focused helpers so each phase is inspectable:
 *
 *   resolveTargetVault         → match vaultAddressArg against configured
 *                                vaults (current primary + legacy entries)
 *   dedupSnapshotsByTimestamp  → collapse rows that share a timestamp,
 *                                preferring the current-primary stamping
 *   fetchVolumeAndOITimeSeries → run the cumulative-volume + trade-count + OI
 *                                raw SQLs over the snapshot timestamps
 *   buildClosedBars            → per-snapshot ProtocolStat rows
 *   appendLiveCandle           → in-progress current-interval bar from
 *                                live vault helpers; non-fatal on failure
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

type ConfiguredVault = ReturnType<typeof getConfiguredVaults>[number];
type Snapshot = Awaited<ReturnType<typeof getProtocolStatsTimeSeries>>[number];

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

/**
 * Cumulative PnL surfaced to the chart rolls up trading activity:
 * settlement PnL, plus wUSDe already earmarked for the vault from
 * resolved-but-not-yet-redeemed wins, plus net secondary-market trade flow.
 *
 * `vaultRealizedPnL` is `grossPayouts(Claim ∪ Close) − primaryCollateral`:
 * the cost basis (`primaryCollateral`) is recognized the moment a pickConfig
 * resolves, but the payout only lands once the holder's `redeem()`/`burn()`
 * is indexed. Between those two events a winning position contributes
 * `−stake` instead of `+profit` — a transient phantom loss that crashed the
 * PnL chart on days when a chunk of the vault's positions resolved before the
 * keeper's `redeemFromEscrow` tx was indexed. `vaultUnredeemedClaim` (= total
 * collateral owed on the vault's winning sides, net of what it's already
 * claimed) exactly cancels that gap, so the line stays stable across the
 * resolve → redeem → index cycle. Airdrops are tracked separately so they can
 * be reported alongside without distorting the trading return shown here.
 */
const cumulativeSnapshotPnL = (s: Snapshot): bigint =>
  BigInt(s.vaultRealizedPnL) +
  BigInt(s.vaultUnredeemedClaim) +
  BigInt(s.vaultSecondarySold) -
  BigInt(s.vaultSecondaryBought);

/**
 * Resolve which vault category the caller wants. Without `vaultAddressArg`
 * we default to the protocol vault (preserves the legacy single-tab default).
 * With it, match against any configured vault's current primary OR any of
 * its legacy entries, so an explicit "give me the pyth tab" pin still works
 * after a future pyth redeploy demotes the address into legacy. Returns
 * `mismatch` when an explicit address doesn't map to any configured vault —
 * resolver returns an empty page in that case rather than silently falling
 * back to the unfiltered all-vault series.
 */
const resolveTargetVault = (
  configuredVaults: ConfiguredVault[],
  vaultAddressArg: string | null | undefined
): { vault: ConfiguredVault | undefined; mismatch: boolean } => {
  const targetArgLower = vaultAddressArg?.toLowerCase();
  const vault = targetArgLower
    ? configuredVaults.find(
        (v) =>
          v.address === targetArgLower ||
          (v.config.legacy ?? []).some(
            (le) =>
              normalizeLegacyEntry(le).address.toLowerCase() === targetArgLower
          )
      )
    : configuredVaults.find((v) => v.kind === 'protocol');
  return { vault, mismatch: Boolean(vaultAddressArg) && !vault };
};

/**
 * Filter the snapshot time series by the full address history of the chosen
 * vault — current primary plus every demoted-to-legacy address. Without
 * the legacies, every SDK redeploy would orphan the entire historical chart
 * until a re-stamping backfill runs. Per-category by construction: the
 * address set only contains entries for the SELECTED vault family.
 */
const collectVaultAddressHistory = (
  vaultConfig: ConfiguredVault['config'] | undefined
): string[] =>
  vaultConfig
    ? [
        vaultConfig.address,
        ...(vaultConfig.legacy ?? []).map(
          (le) => normalizeLegacyEntry(le).address
        ),
      ].map((a) => a.toLowerCase())
    : [];

/**
 * Dedupe by timestamp: a single day can have rows under multiple addresses
 * (current primary + a since-demoted legacy that prod's older cron wrote).
 * Without dedup, queryTimestamps below would contain duplicates, which
 * breaks the cumulativeVolume SQL — UNNEST + LEFT JOIN + GROUP BY ends up
 * multiplying the per-day volume by the number of duplicate rows, producing
 * step-up cumVols that go *backwards* on days with fewer duplicates →
 * negative periodVolume.
 *
 * Preference order when multiple rows share a timestamp: the row stamped
 * under the current primary wins (matches what the post-redeploy backfill
 * writes); otherwise keep whatever was there.
 */
const dedupSnapshotsByTimestamp = (
  rawSnapshots: Snapshot[],
  currentPrimary: string | undefined
): Snapshot[] => {
  const dedup = new Map<number, Snapshot>();
  for (const s of rawSnapshots) {
    const existing = dedup.get(s.timestamp);
    if (
      !existing ||
      (currentPrimary && s.vaultAddress.toLowerCase() === currentPrimary)
    ) {
      dedup.set(s.timestamp, s);
    }
  }
  return [...dedup.values()].sort((a, b) => a.timestamp - b.timestamp);
};

const fetchVolumeAndOITimeSeries = async (
  queryTimestamps: number[],
  chainId: number
): Promise<{
  volumeMap: Map<number, string>;
  tradeCountMap: Map<number, string>;
  oiMap: Map<number, string>;
}> => {
  const [cumulativeVolumes, cumulativeTradeCounts, openInterests] =
    await Promise.all([
      prisma.$queryRaw<CumulativeVolumeRow[]>`
      SELECT
        ts.timestamp,
        COALESCE(SUM(vol), 0)::TEXT as cumulative_volume
      FROM UNNEST(${queryTimestamps}::BIGINT[]) AS ts(timestamp)
      LEFT JOIN (
        SELECT "mintedAt" AS created_ts, CAST("totalCollateral" AS DECIMAL) AS vol, "chainId"
        FROM position
        UNION ALL
        SELECT "onChainCreatedAt" AS created_ts,
          CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol,
          "chainId"
        FROM "Prediction"
        UNION ALL
        SELECT "executedAt" AS created_ts,
          CAST(price AS DECIMAL) AS vol,
          "chainId"
        FROM secondary_trade
      ) combined ON
        combined.created_ts <= ts.timestamp
        AND combined."chainId" = ${chainId}
      GROUP BY ts.timestamp
      ORDER BY ts.timestamp
    `,
      prisma.$queryRaw<CumulativeTradeCountRow[]>`
      SELECT
        ts.timestamp,
        COALESCE(COUNT(combined.created_ts), 0) as cumulative_trade_count
      FROM UNNEST(${queryTimestamps}::BIGINT[]) AS ts(timestamp)
      LEFT JOIN (
        SELECT "onChainCreatedAt" AS created_ts, "chainId"
        FROM "Prediction"
        UNION ALL
        SELECT "executedAt" AS created_ts, "chainId"
        FROM secondary_trade
      ) combined ON
        combined.created_ts <= ts.timestamp
        AND combined."chainId" = ${chainId}
      GROUP BY ts.timestamp
      ORDER BY ts.timestamp
    `,
      prisma.$queryRaw<DailyOIRow[]>`
      SELECT
        ts.timestamp,
        COALESCE(SUM(vol), 0)::TEXT as open_interest
      FROM UNNEST(${queryTimestamps}::BIGINT[]) AS ts(timestamp)
      LEFT JOIN (
        SELECT p."onChainCreatedAt" AS created_ts, pk."resolvedAt" AS settled_ts,
          CAST(p."predictorCollateral" AS DECIMAL) + CAST(p."counterpartyCollateral" AS DECIMAL) AS vol,
          p."chainId"
        FROM "Prediction" p
        LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
      ) combined ON
        combined.created_ts <= ts.timestamp
        AND (combined.settled_ts IS NULL OR combined.settled_ts > ts.timestamp)
        AND combined."chainId" = ${chainId}
      GROUP BY ts.timestamp
      ORDER BY ts.timestamp
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

const buildClosedBars = (
  snapshots: Snapshot[],
  volumeMap: Map<number, string>,
  tradeCountMap: Map<number, string>,
  oiMap: Map<number, string>,
  interval: number
): ProtocolStat[] =>
  snapshots.map((snapshot, i) => {
    const cumVol = volumeMap.get(snapshot.timestamp) || '0';
    const prevCumVol =
      i > 0 ? volumeMap.get(snapshots[i - 1].timestamp) || '0' : '0';
    const periodVolume = (BigInt(cumVol) - BigInt(prevCumVol)).toString();

    const cumTradeCount = Number(tradeCountMap.get(snapshot.timestamp) || '0');
    const prevCumTradeCount =
      i > 0 ? Number(tradeCountMap.get(snapshots[i - 1].timestamp) || '0') : 0;
    const periodTradeCount = cumTradeCount - prevCumTradeCount;

    const cumPnL = cumulativeSnapshotPnL(snapshot);
    const prevCumPnL = i > 0 ? cumulativeSnapshotPnL(snapshots[i - 1]) : 0n;
    const periodPnL = (cumPnL - prevCumPnL).toString();

    return {
      // Display each bar one interval *before* the snapshot's capture
      // timestamp so the label reflects "the period/state represented"
      // rather than "the moment of measurement".
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

/**
 * Compute the in-progress current-interval bar from the live vault helpers.
 * Scoped to the SELECTED vault category — without this the live candle on
 * the Pyth/SingleLeg/StrategyB tabs would silently render protocol-vault
 * numbers, since the helpers default to the protocol primary when no
 * vaultAddress arg is passed. Escrow stays chain-scoped — shared across
 * all vault families on the chain. Returns null on failure (caller logs
 * and falls back to snapshots only).
 */
const buildLiveCandle = async (
  chainId: number,
  vaultAddress: string | undefined,
  lastSnapshot: Snapshot,
  volumeMap: Map<number, string>,
  tradeCountMap: Map<number, string>,
  oiMap: Map<number, string>,
  nowTimestamp: number,
  interval: number
): Promise<ProtocolStat> => {
  const lastCumVol = volumeMap.get(lastSnapshot.timestamp) || '0';
  const liveCumVol = volumeMap.get(nowTimestamp) || lastCumVol;
  const livePeriodVolume = (BigInt(liveCumVol) - BigInt(lastCumVol)).toString();

  const lastTradeCount = Number(tradeCountMap.get(lastSnapshot.timestamp) || '0');
  const liveTradeCount = Number(
    tradeCountMap.get(nowTimestamp) || lastTradeCount
  );
  const livePeriodTradeCount = liveTradeCount - lastTradeCount;

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
    fetchVaultTVL(chainId, vaultAddress),
    fetchVaultAvailableAssets(chainId, vaultAddress),
    fetchVaultDeployed(chainId, undefined, vaultAddress),
    sumEscrowBalancesAtBlock(getProviderForChain(chainId), chainId),
    calculateVaultPnL(chainId, undefined, vaultAddress),
    calculateVaultFlows(chainId, undefined, vaultAddress),
    calculateVaultSecondaryFlows(chainId, undefined, vaultAddress),
    calculateVaultAirdrops(chainId, undefined, vaultAddress),
    calculateVaultUnredeemedClaim(chainId, undefined, vaultAddress),
  ]);

  const liveCumulativePnL =
    livePnlResult.realizedPnL +
    liveUnredeemedClaim +
    liveSecondaryFlows.sold -
    liveSecondaryFlows.bought;
  const livePeriodPnL = (
    liveCumulativePnL - cumulativeSnapshotPnL(lastSnapshot)
  ).toString();

  // Live candle = current in-progress period; label at start of current
  // interval (matches the display shift for closed bars).
  const currentBoundary = Math.floor(Date.now() / 1000 / interval) * interval;

  return {
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
  };
};

export const protocolStats: NonNullable<
  QueryResolvers['protocolStats']
> = async (_parent, { vaultAddress: vaultAddressArg }) => {
  const chainId = DEFAULT_CHAIN_ID;
  const configuredVaults = getConfiguredVaults(chainId);
  const { vault: targetVault, mismatch } = resolveTargetVault(
    configuredVaults,
    vaultAddressArg
  );
  if (mismatch) return [];

  const vaultConfig = targetVault?.config;
  const vaultAddresses = collectVaultAddressHistory(vaultConfig);

  const rawSnapshots = await getProtocolStatsTimeSeries(
    undefined,
    chainId,
    vaultAddresses
  );
  if (rawSnapshots.length === 0) return [];

  const protocolSnapshots = dedupSnapshotsByTimestamp(
    rawSnapshots,
    vaultConfig?.address.toLowerCase()
  );

  const nowTimestamp = Math.floor(Date.now() / 1000);
  const queryTimestamps = [
    ...protocolSnapshots.map((s) => s.timestamp),
    nowTimestamp,
  ];

  const { volumeMap, tradeCountMap, oiMap } = await fetchVolumeAndOITimeSeries(
    queryTimestamps,
    chainId
  );
  const interval = resolveSnapshotIntervalSeconds();
  const results = buildClosedBars(
    protocolSnapshots,
    volumeMap,
    tradeCountMap,
    oiMap,
    interval
  );

  try {
    const liveCandle = await buildLiveCandle(
      chainId,
      vaultConfig?.address.toLowerCase(),
      protocolSnapshots[protocolSnapshots.length - 1],
      volumeMap,
      tradeCountMap,
      oiMap,
      nowTimestamp,
      interval
    );
    results.push(liveCandle);
  } catch (err) {
    log.error(
      { err: err },
      '[protocolStats] live candle failed, falling back to snapshots only:'
    );
  }

  return results;
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
