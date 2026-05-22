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
import { collateralToken } from '@sapience/sdk/contracts/addresses';
import {
  fromGlobalId,
  registerNodeType,
  toGlobalId,
} from '../../../relay/globalId';
import { synthesizeAccount } from '../accountSynthesis';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import type {
  QueryResolvers,
  ProtocolStat,
  VaultStat,
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
  getPriorSnapshot,
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
 * Fat stats row carrying both protocol-wide and vault-specific fields.
 * The two public resolvers each project to a subset of these. Declared
 * as an intersection (rather than `extends ProtocolStat, VaultStat`) so
 * the shared `timestamp` + `__typename` discriminator don't collide.
 */
type FatStat = Omit<ProtocolStat, '__typename'> &
  Omit<VaultStat, '__typename' | 'timestamp' | 'vault'>;

/**
 * Shared inner pipeline for `protocolStats` and `vaultStats`. Returns the
 * "fat" rows (every field both resolvers can read) so each caller can
 * project to its narrower wire type.
 *
 * Windowing: `fromEpoch` / `toEpoch` are inclusive epoch seconds. When
 * `fromEpoch` is set, a single leading baseline snapshot (timestamp <
 * fromEpoch) is prepended so the first windowed bar's `periodVolume` /
 * `periodPnL` deltas anchor correctly; the baseline row is trimmed from
 * the result. The live candle is only emitted when the window covers now
 * (`toEpoch` null or >= now). Without a window the behaviour is unchanged.
 */
const runFatStats = async (
  vaultAddressArg: string | null | undefined,
  fromEpoch: number | null | undefined,
  toEpoch: number | null | undefined
): Promise<FatStat[]> => {
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

  const windowedSnapshots = await getProtocolStatsTimeSeries({
    chainId,
    vaultAddress: vaultAddresses,
    fromEpoch: fromEpoch ?? undefined,
    toEpoch: toEpoch ?? undefined,
  });
  if (windowedSnapshots.length === 0) {
    return [];
  }

  // Leading baseline: when a window is set, fetch the single latest
  // snapshot strictly before `fromEpoch` so `periodVolume` / `periodPnL`
  // for the first windowed bar anchors to the real prior cumulative
  // values. Trimmed from the final result.
  const baselineSnapshot =
    fromEpoch != null && vaultAddresses.length > 0
      ? await getPriorSnapshot({
          vaultAddress: vaultAddresses,
          fromEpoch,
          chainId,
        })
      : null;
  const rawSnapshots = baselineSnapshot
    ? [baselineSnapshot, ...windowedSnapshots]
    : windowedSnapshots;

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

  // Index of the first snapshot that's actually inside the requested window
  // — the baseline (when present) is at index 0 and must be dropped before
  // returning. Without a baseline this is just 0.
  const baselineTrimIndex = baselineSnapshot
    ? protocolSnapshots.findIndex((s) => s.timestamp >= (fromEpoch as number))
    : 0;

  const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
  const nowTimestamp = Math.floor(Date.now() / 1000);
  // Live candle is only meaningful when the window actually covers "now".
  // Without a window (both null), it always covers now. With `toEpoch` < now,
  // historical-only — closed bars only.
  const windowCoversNow = toEpoch == null || toEpoch >= nowTimestamp;
  const queryTimestamps = windowCoversNow
    ? [...snapshotTimestamps, nowTimestamp]
    : [...snapshotTimestamps];

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

  const volumeMap = buildTimestampMap(cumulativeVolumes, 'cumulative_volume');
  const tradeCountMap = buildTimestampMap(
    cumulativeTradeCounts,
    'cumulative_trade_count'
  );
  const oiMap = buildTimestampMap(openInterests, 'open_interest');

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

  const results: FatStat[] = protocolSnapshots.map((snapshot, i) => {
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
      cumulativeTradeCount: cumTradeCount,
      periodTradeCount,
      openInterest: oiMap.get(snapshot.timestamp) || '0',
      balance: snapshot.vaultBalance,
      availableAssets: snapshot.vaultAvailableAssets,
      deployed: snapshot.vaultDeployed,
      escrowBalance: snapshot.escrowBalance,
      cumulativePnL: cumPnL.toString(),
      positionsWon: snapshot.vaultPositionsWon,
      positionsLost: snapshot.vaultPositionsLost,
      deposits: snapshot.vaultDeposits,
      withdrawals: snapshot.vaultWithdrawals,
      airdropGains: snapshot.vaultAirdropGains,
      secondaryBought: snapshot.vaultSecondaryBought,
      secondarySold: snapshot.vaultSecondarySold,
      unredeemedClaim: snapshot.vaultUnredeemedClaim,
      periodPnL,
      periodVolume,
    };
  });

  if (windowCoversNow)
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
      const currentBoundary =
        Math.floor(Date.now() / 1000 / interval) * interval;

      results.push({
        timestamp: currentBoundary,
        cumulativeVolume: liveCumVol,
        cumulativeTradeCount: liveTradeCount,
        periodTradeCount: livePeriodTradeCount,
        openInterest: oiMap.get(nowTimestamp) || '0',
        balance: liveVaultBalance.toString(),
        availableAssets: liveVaultAvailableAssets.toString(),
        deployed: liveVaultDeployed.toString(),
        escrowBalance: liveEscrowBalance.toString(),
        cumulativePnL: liveCumulativePnL.toString(),
        positionsWon: livePnlResult.positionsWon,
        positionsLost: livePnlResult.positionsLost,
        deposits: liveFlowsResult.totalDeposits.toString(),
        withdrawals: liveFlowsResult.totalWithdrawals.toString(),
        airdropGains: liveAirdropGains.toString(),
        secondaryBought: liveSecondaryFlows.bought.toString(),
        secondarySold: liveSecondaryFlows.sold.toString(),
        unredeemedClaim: liveUnredeemedClaim.toString(),
        periodPnL: livePeriodPnL,
        periodVolume: livePeriodVolume,
      });
    } catch (err) {
      log.error(
        { err: err },
        '[protocolStats] live candle failed, falling back to snapshots only:'
      );
    }

  // Trim the leading baseline row (it only existed to anchor the first
  // windowed bar's `period*` deltas).
  return baselineTrimIndex > 0 ? results.slice(baselineTrimIndex) : results;
};

/**
 * Project protocol-wide fields from the fat shared pipeline.
 */
type ProtocolStatsArgs = {
  from?: number | null;
  to?: number | null;
  fromEpoch?: number | null;
  toEpoch?: number | null;
};

type VaultStatsArgs = ProtocolStatsArgs & {
  vaultAddress?: string | null;
};

const protocolStatsImpl = async (
  _parent: unknown,
  { from, to, fromEpoch, toEpoch }: ProtocolStatsArgs
): Promise<ProtocolStat[]> => {
  const fat = await runFatStats(undefined, from ?? fromEpoch, to ?? toEpoch);
  return fat.map(
    (s): ProtocolStat => ({
      timestamp: s.timestamp,
      cumulativeVolume: s.cumulativeVolume,
      cumulativeTradeCount: s.cumulativeTradeCount,
      periodTradeCount: s.periodTradeCount,
      periodVolume: s.periodVolume,
      openInterest: s.openInterest,
      escrowBalance: s.escrowBalance,
    })
  );
};

export const protocolStats = protocolStatsImpl as unknown as NonNullable<
  QueryResolvers['protocolStats']
>;

/**
 * Project vault-specific fields from the fat shared pipeline.
 */
const vaultStatsImpl = async (
  _parent: unknown,
  { vaultAddress, from, to, fromEpoch, toEpoch }: VaultStatsArgs
): Promise<VaultStat[]> => {
  const fat = await runFatStats(vaultAddress, from ?? fromEpoch, to ?? toEpoch);
  return fat.map(
    (s) =>
      ({
        timestamp: s.timestamp,
        balance: s.balance,
        availableAssets: s.availableAssets,
        deployed: s.deployed,
        cumulativePnL: s.cumulativePnL,
        positionsWon: s.positionsWon,
        positionsLost: s.positionsLost,
        deposits: s.deposits,
        withdrawals: s.withdrawals,
        airdropGains: s.airdropGains,
        secondaryBought: s.secondaryBought,
        secondarySold: s.secondarySold,
        unredeemedClaim: s.unredeemedClaim,
        periodPnL: s.periodPnL,
      }) as unknown as VaultStat
  );
};

export const vaultStats = vaultStatsImpl as unknown as NonNullable<
  QueryResolvers['vaultStats']
>;

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

export const openInterestByCategory = (() =>
  fetchOpenInterestByCategory()) as unknown as NonNullable<
  QueryResolvers['openInterestByCategory']
>;

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

const vaultDomainId = (chainId: number, address: string) =>
  `${chainId}:${address.toLowerCase()}`;

const vaultCollateral = (chainId: number) => ({
  symbol: 'wUSDe',
  address: (collateralToken[chainId]?.address ?? '').toLowerCase(),
  decimals: 18,
  chainId,
});

const mapVault = (
  vault: ReturnType<typeof getConfiguredVaults>[number],
  chainId: number
) => ({
  id: toGlobalId('Vault', vaultDomainId(chainId, vault.address)),
  address: vault.address,
  chainId,
  collateral: vaultCollateral(chainId),
  account: synthesizeAccount(vault.address),
});

const parseVaultDomainId = (id: string) => {
  const [chainIdRaw, addressRaw] = id.split(':');
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || !addressRaw) return null;
  return { chainId, address: addressRaw.toLowerCase() };
};

registerNodeType({
  type: 'Vault',
  loader: async (id) => {
    const parsed = parseVaultDomainId(id);
    if (!parsed) return null;
    const vault = getConfiguredVaults(parsed.chainId).find(
      (v) =>
        v.address === parsed.address ||
        (v.config.legacy ?? []).some(
          (le) =>
            normalizeLegacyEntry(le).address.toLowerCase() === parsed.address
        )
    );
    return vault
      ? mapVault({ ...vault, address: parsed.address }, parsed.chainId)
      : null;
  },
});

export const protocol = (async () => ({})) as unknown as NonNullable<
  QueryResolvers['protocol']
>;

const findVaultByAddress = (chainId: number, address: string) => {
  const addr = address.toLowerCase();
  const vault = getConfiguredVaults(chainId).find(
    (v) =>
      v.address === addr ||
      (v.config.legacy ?? []).some(
        (le) => normalizeLegacyEntry(le).address.toLowerCase() === addr
      )
  );
  return vault ? mapVault({ ...vault, address: addr }, chainId) : null;
};

export const vault = (async (_parent: unknown, { id }: { id: string }) => {
  const parsed = parseVaultDomainId(fromGlobalId(id).id);
  if (!parsed) return null;
  return findVaultByAddress(parsed.chainId, parsed.address);
}) as unknown as NonNullable<QueryResolvers['vault']>;

type VaultsConnectionArgs = {
  first?: number | null;
  after?: string | null;
  filter?: { address?: string | null; chainId?: number | null } | null;
};

export const vaultsConnection = (async (
  _parent: unknown,
  { first, after, filter }: VaultsConnectionArgs
) => {
  const cappedFirst = Math.min(Math.max(first ?? 50, 1), 100);
  const chainId = filter?.chainId ?? DEFAULT_CHAIN_ID;

  // Optimization: when filter.address is set, short-circuit to a direct
  // lookup — same payload, no list scan.
  let nodes: ReturnType<typeof mapVault>[];
  if (filter?.address) {
    const node = findVaultByAddress(chainId, filter.address);
    nodes = node ? [node] : [];
  } else {
    nodes = getConfiguredVaults(chainId).map((v) => mapVault(v, chainId));
  }

  const totalCount = nodes.length;
  const startOffset = (() => {
    const payload = after ? decodeCursor(after) : null;
    const offset = payload ? Number(payload.k) : Number.NaN;
    return Number.isInteger(offset) && offset >= 0 ? offset + 1 : 0;
  })();
  const window = nodes.slice(startOffset, startOffset + cappedFirst);
  const edges = window.map((node, i) => ({
    node,
    cursor: encodeCursor({ k: String(startOffset + i), id: node.address }),
  }));
  return {
    edges,
    nodes: window,
    totalCount,
    pageInfo: {
      hasNextPage: startOffset + window.length < totalCount,
      hasPreviousPage: startOffset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}) as unknown as NonNullable<QueryResolvers['vaultsConnection']>;

export const Protocol = {
  stats: async (
    _parent: unknown,
    args: {
      filter?: { timestamp?: { gte?: number; lte?: number } | null } | null;
    }
  ) => {
    const rows = await protocolStatsImpl(null, {
      fromEpoch: args.filter?.timestamp?.gte ?? undefined,
      toEpoch: args.filter?.timestamp?.lte ?? undefined,
    });
    const nodes = rows;
    const edges = nodes.map((node, i) => ({
      node,
      cursor: encodeCursor({ k: String(node.timestamp), id: String(i) }),
    }));
    return {
      edges,
      nodes,
      totalCount: nodes.length,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges.at(-1)?.cursor ?? null,
      },
    };
  },
  openInterestByCategory: () => fetchOpenInterestByCategory(),
  openInterestByTimeToResolution: () => fetchOpenInterestByTimeToResolution(),
} as never;

export const Vault = {
  stats: async (
    parent: { address: string },
    args: {
      filter?: { timestamp?: { gte?: number; lte?: number } | null } | null;
    }
  ) => {
    const rows = await vaultStatsImpl(null, {
      vaultAddress: parent.address,
      fromEpoch: args.filter?.timestamp?.gte ?? undefined,
      toEpoch: args.filter?.timestamp?.lte ?? undefined,
    });
    const nodes = rows.map((row) => ({ ...row, vault: parent }));
    const edges = nodes.map((node, i) => ({
      node,
      cursor: encodeCursor({ k: String(node.timestamp), id: String(i) }),
    }));
    return {
      edges,
      nodes,
      totalCount: nodes.length,
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges.at(-1)?.cursor ?? null,
      },
    };
  },
} as never;
