/**
 * Account-stats queries that share a single aggregation pipeline:
 *
 *   - `accountStatsLeaderboardPage`: addresses ranked by a chosen account
 *     metric over an optional epoch-seconds window. Page-shaped with
 *     server-truth `hasMore`; `totalCount` is populated unconditionally
 *     (cheap — it's the length of the in-memory merged-stats array).
 *   - `accountStatsRank`: stats + rank for ONE address, sourced from the same
 *     ranked set the leaderboard slices, so the two surfaces reconcile
 *     byte-for-byte.
 *
 * Metrics: NET_PNL / GAINS / LOSSES (from `calculateAccountPnLBreakdown`,
 * attributed to settlement time) and VOLUME (from `calculateAccountVolumes`,
 * attributed to trade time). Both aggregations for a given window are
 * merged by address and held in a short TTL cache; ranking and pagination
 * are trivial array ops once cached.
 *
 * `filters` omitted ⇒ rank by `NET_PNL` over all-time. Inside `filters`:
 * `fromEpoch` omitted ⇒ no lower bound (all-time); `toEpoch` omitted ⇒ now.
 */
import type { QueryResolvers } from '../../__generated__/resolvers';
import { AccountStatsMetric } from '../../__generated__/resolvers';
import { TtlCache } from '../../../../lib/ttlCache';
import {
  calculateAccountPnLBreakdown,
  calculateAccountVolumes,
} from '../../../../services/accountStats';
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
    filters?.fromEpoch,
    filters?.toEpoch
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
    filters?.fromEpoch,
    filters?.toEpoch
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
