/**
 * Account-stats queries — three surfaces, two pipelines:
 *
 *   - `accountStatsLeaderboardPage`: addresses ranked by a chosen account
 *     metric over an optional epoch-seconds window. Page-shaped with
 *     server-truth `hasMore`; `totalCount` is populated unconditionally
 *     (cheap — it's the length of the in-memory merged-stats array).
 *   - `accountStatsRank`: stats + rank for ONE address, sourced from the same
 *     ranked set the leaderboard slices, so the two surfaces reconcile
 *     byte-for-byte.
 *   - `accountStats`: per-account stats *time series* (fat row mirroring
 *     `protocolStats` / `vaultStats`). Distinct pipeline from the two
 *     leaderboard surfaces — see the dedicated docstring below.
 *
 * Leaderboard metrics: NET_PNL / GAINS / LOSSES (from
 * `calculateAccountPnLBreakdown`, attributed to settlement time) and VOLUME
 * (from `calculateAccountVolumes`, attributed to trade time). Both
 * aggregations for a given window are merged by address and held in a short
 * TTL cache; ranking and pagination are trivial array ops once cached.
 *
 * For the leaderboard/rank surfaces: `filters` omitted ⇒ rank by `NET_PNL`
 * over all-time. Inside `filters`: `fromEpoch` omitted ⇒ no lower bound
 * (all-time); `toEpoch` omitted ⇒ now.
 */
import type {
  QueryResolvers,
  AccountStat,
} from '../../__generated__/resolvers';
import { AccountStatsMetric } from '../../__generated__/resolvers';
import { TtlCache } from '../../../../lib/ttlCache';
import {
  calculateAccountPnLBreakdown,
  calculateAccountVolumes,
} from '../../../../services/accountStats';
import {
  queryAccountVolume,
  queryAccountPnl,
  queryAccountBalance,
  queryAccountPredictionCount,
} from '../../../../services/timeSeriesQueries';
import { TimeInterval as HelperTimeInterval } from '../../../../services/timeSeriesTypes';
import { clampSkip, clampTake } from './pagination';

interface AccountStatsLeaderboardEntry {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
}

const cache = new TtlCache<string, AccountStatsLeaderboardEntry[]>({
  ttlMs: 60_000,
  maxSize: 50,
});

/** Numeric value (in ether units) for ranking; precision loss is fine for sort order. */
const num = (wei: string): number => {
  const v = parseFloat(wei) / 1e18;
  return Number.isFinite(v) ? v : 0;
};

const getMerged = async (
  fromEpoch: number | undefined,
  toEpoch: number
): Promise<AccountStatsLeaderboardEntry[]> => {
  const key = `${fromEpoch ?? 'all'}:${toEpoch}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const [pnl, volume] = await Promise.all([
    calculateAccountPnLBreakdown({ fromEpoch, toEpoch }),
    calculateAccountVolumes({ fromEpoch, toEpoch }),
  ]);

  const byAddress = new Map<string, AccountStatsLeaderboardEntry>();
  const entryFor = (address: string): AccountStatsLeaderboardEntry => {
    const addr = address.toLowerCase();
    let e = byAddress.get(addr);
    if (!e) {
      e = { address: addr, netPnL: '0', gains: '0', losses: '0', volume: '0' };
      byAddress.set(addr, e);
    }
    return e;
  };
  for (const r of pnl) {
    const e = entryFor(r.address);
    e.netPnL = r.netPnL;
    e.gains = r.gains;
    e.losses = r.losses;
  }
  for (const r of volume) {
    entryFor(r.address).volume = r.volume;
  }

  const merged = Array.from(byAddress.values());
  cache.set(key, merged);
  return merged;
};

/**
 * Order a merged set by the chosen metric. Returns a new array so callers
 * sharing the cached `entries` don't see mutated ordering on next sort.
 */
const rankedFor = (
  entries: AccountStatsLeaderboardEntry[],
  metric: AccountStatsMetric
): AccountStatsLeaderboardEntry[] =>
  [...entries].sort((a, b) => {
    switch (metric) {
      case AccountStatsMetric.Gains:
        return num(b.gains) - num(a.gains);
      case AccountStatsMetric.Losses:
        // Biggest losses first ⇒ most negative first.
        return num(a.losses) - num(b.losses);
      case AccountStatsMetric.Volume:
        return num(b.volume) - num(a.volume);
      case AccountStatsMetric.NetPnl:
      default:
        return num(b.netPnL) - num(a.netPnL);
    }
  });

/** Snap epoch seconds down to the minute so the cache key isn't unique per request. */
const floorToMinute = (epochSeconds: number): number =>
  Math.floor(epochSeconds / 60) * 60;

const resolveWindow = (
  fromEpoch: number | null | undefined,
  toEpoch: number | null | undefined
): { fromEpoch: number | undefined; toEpochResolved: number } => {
  const toEpochResolved = floorToMinute(
    toEpoch ?? Math.floor(Date.now() / 1000)
  );
  const fromEpochResolved =
    fromEpoch != null ? floorToMinute(fromEpoch) : undefined;
  return { fromEpoch: fromEpochResolved, toEpochResolved };
};

const DEFAULT_LEADERBOARD_TAKE = 25;

export const accountStatsLeaderboardPage: NonNullable<
  QueryResolvers['accountStatsLeaderboardPage']
> = async (_parent, { filters, take, skip }) => {
  const metric = filters?.metric ?? AccountStatsMetric.NetPnl;
  const { fromEpoch: fromResolved, toEpochResolved } = resolveWindow(
    filters?.from ?? filters?.fromEpoch,
    filters?.to ?? filters?.toEpoch
  );
  const entries = await getMerged(fromResolved, toEpochResolved);
  const ranked = rankedFor(entries, metric);

  const cappedTake = clampTake(take, { defaultTake: DEFAULT_LEADERBOARD_TAKE });
  const cappedSkip = clampSkip(skip);
  const items = ranked.slice(cappedSkip, cappedSkip + cappedTake);
  const hasMore = cappedSkip + items.length < ranked.length;

  // totalCount is cheap (the in-memory ranked array's length), so populate
  // unconditionally — no field-resolver lazy gate needed for this surface.
  return { items, hasMore, totalCount: ranked.length };
};

/** Empty-window stub: address echoed back with all stats zeroed and no rank. */
const emptyStatsRank = (
  address: string
): {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
  rank: number | null;
  totalParticipants: number;
} => ({
  address,
  netPnL: '0',
  gains: '0',
  losses: '0',
  volume: '0',
  rank: null,
  totalParticipants: 0,
});

/**
 * `accountStatsRank` — single-address lookup against the same ranked set the
 * leaderboard slices. Reuses `getMerged` + `rankedFor`, so rank and stats
 * here always reconcile with `accountStatsLeaderboardPage` for the same
 * window. Stats are always returned (zero when the address has no activity);
 * `rank` is null when the address is absent from the ranked set.
 */
export const accountStatsRank: NonNullable<
  QueryResolvers['accountStatsRank']
> = async (_parent, { address, filters }) => {
  const metric = filters?.metric ?? AccountStatsMetric.NetPnl;
  const addressLc = address.toLowerCase();
  const { fromEpoch: fromResolved, toEpochResolved } = resolveWindow(
    filters?.from ?? filters?.fromEpoch,
    filters?.to ?? filters?.toEpoch
  );
  const entries = await getMerged(fromResolved, toEpochResolved);
  if (entries.length === 0) return emptyStatsRank(addressLc);

  const ranked = rankedFor(entries, metric);
  const idx = ranked.findIndex((e) => e.address === addressLc);
  if (idx < 0) {
    return { ...emptyStatsRank(addressLc), totalParticipants: ranked.length };
  }
  const entry = ranked[idx];
  return { ...entry, rank: idx + 1, totalParticipants: ranked.length };
};

// ─── accountStats (time series fat row) ─────────────────────────────────────
//
// Wire shape mirrors `protocolStats` / `vaultStats`: caller passes a window,
// server emits one row per snapshot. Today this wraps the legacy per-metric
// SQL helpers at a fixed daily cadence and merges by timestamp. A follow-up
// introduces a real per-account snapshot table + cron writer + backfill,
// and this resolver swaps to a single `SELECT … FROM "AccountStatSnapshot"`
// — no wire change.
//
// The legacy `accountBalance` / `accountPnl` / `accountPredictionCount` /
// `accountVolume` resolvers are kept as `@deprecated` wrappers around the
// same helpers; this resolver is their consolidated replacement.

/** Max DAY buckets in the legacy helpers — matches `MAX_BUCKETS[DAY]`. */
const MAX_DAY_BUCKETS = 365;
const SECONDS_PER_DAY = 86_400;

const epochToDate = (epoch: number): Date => new Date(epoch * 1000);

/**
 * `accountStats` — per-account stats time series. Args mirror
 * `protocolStats` / `vaultStats`: `address` plus optional inclusive
 * epoch-second bounds `fromEpoch` / `toEpoch`. Both omitted ⇒ last 365
 * days (the DAY-bucket cap in the helper layer); the SDL doc-string
 * documents this. A wider window would tip the helpers' bucket-count
 * guard until the snapshot table lands and the cap goes away.
 *
 * Field naming follows the family: per-bucket deltas use the `period…`
 * prefix (`periodPnL`, `periodVolume`), cumulative-through-bucket values
 * use the `cumulative…` prefix (`cumulativePnL`, `cumulativeVolume`).
 * `PnL` is capitalized to match `netPnL` on the leaderboard surfaces.
 */
export const accountStats: NonNullable<QueryResolvers['accountStats']> = async (
  _parent,
  { address, from, to, fromEpoch, toEpoch }
) => {
  const addr = address.toLowerCase();

  const nowEpoch = Math.floor(Date.now() / 1000);
  const resolvedTo = to ?? toEpoch ?? nowEpoch;
  const resolvedFrom =
    from ?? fromEpoch ?? resolvedTo - MAX_DAY_BUCKETS * SECONDS_PER_DAY;

  const fromDate = epochToDate(resolvedFrom);
  const toDate = epochToDate(resolvedTo);

  // Parallel fan-out across the four legacy helpers; each hits a separate
  // `generate_series`-based SQL so contention is low.
  const [volumePoints, pnlPoints, balancePoints, countPoints] =
    await Promise.all([
      queryAccountVolume(addr, HelperTimeInterval.DAY, fromDate, toDate),
      queryAccountPnl(addr, HelperTimeInterval.DAY, fromDate, toDate),
      queryAccountBalance(addr, HelperTimeInterval.DAY, fromDate, toDate),
      queryAccountPredictionCount(
        addr,
        HelperTimeInterval.DAY,
        fromDate,
        toDate
      ),
    ]);

  // Build by-timestamp lookups so a sparse helper doesn't drop bars from
  // the merged series. The helpers share a generate_series spine, so in
  // practice timestamps line up bucket-for-bucket — the maps are
  // defensive scaffolding that costs nothing for the small bucket counts
  // here (≤365).
  type VolumeRow = (typeof volumePoints)[number];
  type PnlRow = (typeof pnlPoints)[number];
  type BalanceRow = (typeof balancePoints)[number];
  type CountRow = (typeof countPoints)[number];

  const byTs = <T extends { timestamp: number }>(
    rows: readonly T[]
  ): Map<number, T> => new Map(rows.map((r) => [r.timestamp, r]));

  const volumeByTs = byTs<VolumeRow>(volumePoints);
  const pnlByTs = byTs<PnlRow>(pnlPoints);
  const balanceByTs = byTs<BalanceRow>(balancePoints);
  const countByTs = byTs<CountRow>(countPoints);

  // Union of all timestamps so a sparse helper doesn't drop bars; sort
  // ascending for stable rendering on the consumer side.
  const allTimestamps = Array.from(
    new Set<number>([
      ...volumePoints.map((r) => r.timestamp),
      ...pnlPoints.map((r) => r.timestamp),
      ...balancePoints.map((r) => r.timestamp),
      ...countPoints.map((r) => r.timestamp),
    ])
  ).sort((a, b) => a - b);

  // `queryAccountVolume` reports per-bucket volume only; cumulative is
  // computed here as a running sum so the fat row matches the
  // `cumulativePnL` shape. (`queryAccountPnl` already supplies cumulative.)
  let runningVolume = 0n;
  const results: AccountStat[] = allTimestamps.map((ts) => {
    const v = volumeByTs.get(ts);
    const p = pnlByTs.get(ts);
    const b = balanceByTs.get(ts);
    const c = countByTs.get(ts);

    const bucketVolume = v?.volume ?? '0';
    runningVolume += BigInt(bucketVolume);

    return {
      timestamp: ts,
      periodPnL: p?.pnl ?? '0',
      cumulativePnL: p?.cumulativePnl ?? '0',
      periodVolume: bucketVolume,
      cumulativeVolume: runningVolume.toString(),
      deployedCollateral: b?.deployedCollateral ?? '0',
      claimableCollateral: b?.claimableCollateral ?? '0',
      predictionsTotal: c?.total ?? 0,
      predictionsWon: c?.won ?? 0,
      predictionsLost: c?.lost ?? 0,
      predictionsPending: c?.pending ?? 0,
      predictionsNonDecisive: c?.nonDecisive ?? 0,
    };
  });

  return results;
};
