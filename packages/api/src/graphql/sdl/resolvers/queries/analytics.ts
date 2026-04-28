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
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import type {
  QueryResolvers,
  ProtocolStat,
  CategoryOpenInterest,
  Category,
  TimeToResolutionBucket,
} from '../../__generated__/resolvers';
import prisma from '../../../../db';
import {
  calculateVaultAirdrops,
  calculateVaultFlows,
  calculateVaultPnL,
  calculateVaultSecondaryFlows,
  fetchVaultAvailableAssets,
  fetchVaultDeployed,
  fetchVaultTVL,
  getProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds,
  sumEscrowBalancesAtBlock,
} from '../../../../helpers/protocolStats';
import { getProviderForChain } from '../../../../utils/utils';

interface CumulativeVolumeRow {
  timestamp: bigint;
  cumulative_volume: string | null;
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

export const protocolStats: NonNullable<
  QueryResolvers['protocolStats']
> = async (_parent, { vaultAddress: vaultAddressArg }) => {
  const chainId = DEFAULT_CHAIN_ID;
  const vaultConfig = contracts.predictionMarketVault[chainId];

  // Filter the snapshot time series by the full vault history — current
  // primary plus every demoted-to-legacy address — so historical rows written
  // under a since-redeployed primary stay visible. Without the legacies,
  // every SDK redeploy would orphan the entire historical chart until a
  // re-stamping backfill runs.
  //
  // If the caller passes an explicit `vaultAddressArg`, use exactly that
  // address (no expansion) — they're targeting a specific deploy.
  const vaultAddresses: string[] = vaultAddressArg
    ? [vaultAddressArg.toLowerCase()]
    : vaultConfig
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

  const [cumulativeVolumes, openInterests] = await Promise.all([
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
        WHERE NOT EXISTS (
          SELECT 1 FROM "Pick" pi
          JOIN "condition" c ON c.id = pi."conditionId"
          WHERE pi."pickConfigId" = pk.id AND c.public = false
        )
      ) combined ON
        combined.created_ts <= ts.timestamp
        AND (combined.settled_ts IS NULL OR combined.settled_ts > ts.timestamp)
        AND combined."chainId" = ${chainId}
      GROUP BY ts.timestamp
      ORDER BY ts.timestamp
    `,
  ]);

  const volumeMap = buildTimestampMap(cumulativeVolumes, 'cumulative_volume');
  const oiMap = buildTimestampMap(openInterests, 'open_interest');

  // Display each bar one interval *before* the snapshot's capture timestamp
  // so the label reflects "the period/state represented" rather than "the
  // moment of measurement".
  const interval = resolveSnapshotIntervalSeconds();

  // Cumulative PnL surfaced to the chart rolls up trading activity:
  // settlement PnL plus net secondary-market trade flow. Airdrops are
  // tracked separately so they can be reported alongside without
  // distorting the trading return shown in the PnL chart.
  const cumulativePnL = (s: (typeof protocolSnapshots)[number]): bigint =>
    BigInt(s.vaultRealizedPnL) +
    BigInt(s.vaultSecondarySold) -
    BigInt(s.vaultSecondaryBought);

  const results: ProtocolStat[] = protocolSnapshots.map((snapshot, i) => {
    const cumVol = volumeMap.get(snapshot.timestamp) || '0';
    const prevCumVol =
      i > 0 ? volumeMap.get(protocolSnapshots[i - 1].timestamp) || '0' : '0';
    const periodVolume = (BigInt(cumVol) - BigInt(prevCumVol)).toString();

    const cumPnL = cumulativePnL(snapshot);
    const prevCumPnL = i > 0 ? cumulativePnL(protocolSnapshots[i - 1]) : 0n;
    const periodPnL = (cumPnL - prevCumPnL).toString();

    return {
      timestamp: snapshot.timestamp - interval,
      cumulativeVolume: cumVol,
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

    const [
      liveVaultBalance,
      liveVaultAvailableAssets,
      liveVaultDeployed,
      liveEscrowBalance,
      livePnlResult,
      liveFlowsResult,
      liveSecondaryFlows,
      liveAirdropGains,
    ] = await Promise.all([
      fetchVaultTVL(chainId),
      fetchVaultAvailableAssets(chainId),
      fetchVaultDeployed(chainId),
      // Sum across current + past V2 escrow deploys at chain head, matching
      // the cron/backfill behaviour. Reading only the current primary (as
      // before) would understate live TVL on every redeploy.
      sumEscrowBalancesAtBlock(getProviderForChain(chainId), chainId),
      calculateVaultPnL(chainId),
      calculateVaultFlows(chainId),
      calculateVaultSecondaryFlows(chainId),
      calculateVaultAirdrops(chainId),
    ]);

    const liveCumulativePnL =
      livePnlResult.realizedPnL +
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
      periodPnL: livePeriodPnL,
      periodVolume: livePeriodVolume,
    });
  } catch (err) {
    console.error(
      '[protocolStats] live candle failed, falling back to snapshots only:',
      err
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
 * total. Uses `IDX_condition_market_filter (public, chainId, ...)`.
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
    WHERE c.public = true
      AND c.settled = false
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
 * pickConfig once (max endTime across legs, all-public flag), then joins
 * predictions in a single pass — avoiding the Pick × condition fan-out that
 * the obvious join would create. Predictions whose latest endTime is in the
 * past but haven't been resolved roll into bucket 1 (imminent / overdue).
 *
 * Mirrors the privacy filter used by the OI time-series resolver: drops any
 * prediction that touches a non-public condition, so the totals reconcile with
 * what's shown elsewhere. The CTE pre-filters Pick rows by condition.chainId
 * so the per-pickConfig aggregation only walks rows for the target chain
 * (Pick legs are co-chain with their pickConfig in practice). Cached
 * in-process for 60s with single-flight.
 */
const fetchOpenInterestByTimeToResolution = memoTtl(
  async (): Promise<TimeToResolutionBucket[]> => {
    const chainId = DEFAULT_CHAIN_ID;
    const rows = await prisma.$queryRaw<TimeToResolutionRow[]>`
    WITH per_pick_config AS (
      SELECT
        pi."pickConfigId" AS pick_config_id,
        MAX(c."endTime")  AS max_end_time,
        BOOL_AND(c.public) AS all_public
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
      AND x.all_public
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
