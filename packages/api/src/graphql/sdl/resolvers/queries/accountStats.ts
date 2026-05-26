/**
 * Account-stats leaderboard queries (the only resolvers the
 * accounts-leaderboard restore needs):
 *
 *   - `accountStatsLeaderboardPage`: addresses ranked by a chosen
 *     account metric over an optional epoch-seconds window.
 *     Page-shaped with server-truth `hasMore`; `totalCount` is
 *     populated unconditionally (cheap — it's the length of the
 *     in-memory merged-stats array).
 *   - `accountStatsRank`: stats + rank for ONE address, sourced from
 *     the same ranked set the leaderboard slices, so the two surfaces
 *     reconcile byte-for-byte.
 *
 * Leaderboard metrics: NET_PNL / GAINS / LOSSES (from
 * `calculateAccountPnLBreakdown`, attributed to settlement time) and
 * VOLUME (from `calculateAccountVolumes`, attributed to trade time).
 * Both aggregations for a given window are merged by address and held
 * in a short TTL cache; ranking and pagination are trivial array ops
 * once cached.
 *
 * `filters` omitted ⇒ rank by `NET_PNL` over all-time. Inside
 * `filters`: `from` omitted ⇒ no lower bound (all-time); `to` omitted
 * ⇒ now.
 */
import type { QueryResolvers } from '../../__generated__/resolvers';
import { AccountStatsMetric } from '../../__generated__/resolvers';
import { TtlCache } from '../../../../lib/ttlCache';
import {
  calculateAccountPnLBreakdown,
  calculateAccountVolumes,
} from '../../../../services/accountStats';
import { clampSkip, clampTake } from './pagination';

export interface AccountStatsLeaderboardEntry {
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

export const getMerged = async (
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
export const rankedFor = (
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

export const resolveWindow = (
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

type FiltersArg =
  | {
      metric?: AccountStatsMetric | null;
      from?: number | null;
      to?: number | null;
    }
  | null
  | undefined;

const resolveMetric = (filters: FiltersArg): AccountStatsMetric =>
  filters?.metric ?? AccountStatsMetric.NetPnl;

const emptyStatsRank = (address: string) => ({
  address,
  netPnL: '0',
  gains: '0',
  losses: '0',
  volume: '0',
  rank: null,
  totalParticipants: 0,
});

export const accountStatsLeaderboardPage: NonNullable<
  QueryResolvers['accountStatsLeaderboardPage']
> = async (_parent, { filters, take, skip }) => {
  const take_ = clampTake(take ?? 25, { defaultTake: 25, maxTake: 100 });
  const skip_ = clampSkip(skip ?? 0);
  const metric = resolveMetric(filters);
  const { fromEpoch, toEpochResolved } = resolveWindow(
    filters?.from ?? null,
    filters?.to ?? null
  );

  const entries = await getMerged(fromEpoch, toEpochResolved);
  const ranked = rankedFor(entries, metric);
  const items = ranked.slice(skip_, skip_ + take_);
  const hasMore = skip_ + items.length < ranked.length;
  return {
    items,
    hasMore,
    totalCount: ranked.length,
  };
};

export const runAccountStatsRank = async ({
  address,
  filters,
}: {
  address: string;
  filters?: FiltersArg;
}) => {
  const addressLc = address.toLowerCase();
  const metric = resolveMetric(filters ?? null);
  const { fromEpoch, toEpochResolved } = resolveWindow(
    filters?.from ?? null,
    filters?.to ?? null
  );

  const entries = await getMerged(fromEpoch, toEpochResolved);
  const ranked = rankedFor(entries, metric);
  const idx = ranked.findIndex((e) => e.address === addressLc);
  if (idx < 0) {
    return { ...emptyStatsRank(addressLc), totalParticipants: ranked.length };
  }
  const entry = ranked[idx];
  return { ...entry, rank: idx + 1, totalParticipants: ranked.length };
};

export const accountStatsRank: NonNullable<
  QueryResolvers['accountStatsRank']
> = (_parent, args) => runAccountStatsRank(args);
