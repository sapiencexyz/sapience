/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Account-stats aggregation backing the v2 leaderboard / `Account.rank`.
 *
 * `getMerged` joins per-address PnL and volume aggregations for a window
 * and caches by `(fromEpoch, toEpoch)` minute key. `rankedFor` orders the
 * merged set by one of NET_PNL / GAINS / LOSSES / VOLUME (the column
 * `rankedAccountsForMetric` reaches for; v2 only ranks by PNL / VOLUME
 * directly and computes ROI as a ratio of the two).
 */

import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import {
  calculateAccountPnLBreakdown,
  calculateAccountVolumes,
} from '../../../../services/accountStats';
import { LeaderboardMetric } from '../../__generated__/resolvers';

/**
 * Accuracy backing for the leaderboard. `twError` in
 * `attester_market_tw_error` stores `(1 - brier) * tau` — already an
 * accuracy score where higher is better — averaged per attester.
 */
const accuracyCache = new TtlCache<
  string,
  { attester: string; accuracyScore: number }[]
>({ ttlMs: 60_000, maxSize: 1 });

export const getLeaderboardScores = async (): Promise<
  { attester: string; accuracyScore: number }[]
> => {
  const cached = accuracyCache.get('leaderboard');
  if (cached) return cached;
  const agg = await prisma.attesterMarketTwError.groupBy({
    by: ['attester'],
    _avg: { twError: true },
  });
  const scores = agg
    .map((row) => ({
      attester: (row.attester as string).toLowerCase(),
      accuracyScore: (row._avg.twError as number | null) ?? 0,
    }))
    .sort((a, b) => b.accuracyScore - a.accuracyScore);
  accuracyCache.set('leaderboard', scores);
  return scores;
};

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

export const getAccountStatsCacheStats = (): {
  merged: { size: number; live: number };
  accuracy: { size: number; live: number };
} => ({
  merged: { size: cache.size(), live: cache.liveSize() },
  accuracy: { size: accuracyCache.size(), live: accuracyCache.liveSize() },
});

export type RankColumn = 'NET_PNL' | 'VOLUME';

export const rankedFor = (
  entries: AccountStatsLeaderboardEntry[],
  column: RankColumn
): AccountStatsLeaderboardEntry[] =>
  [...entries].sort((a, b) => {
    switch (column) {
      case 'VOLUME':
        return num(b.volume) - num(a.volume);
      case 'NET_PNL':
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

const valueForMetric = (
  entry: AccountStatsLeaderboardEntry,
  metric: LeaderboardMetric
): string => {
  if (metric === LeaderboardMetric.Volume) return entry.volume;
  if (metric === LeaderboardMetric.Roi) {
    const volume = Number(BigInt(entry.volume || '0'));
    if (!Number.isFinite(volume) || volume === 0) return '0';
    return String(Number(BigInt(entry.netPnL || '0')) / volume);
  }
  return entry.netPnL;
};

const numericMetricValue = (
  entry: AccountStatsLeaderboardEntry,
  metric: LeaderboardMetric
): number => {
  if (metric === LeaderboardMetric.Volume)
    return Number(BigInt(entry.volume || '0'));
  if (metric === LeaderboardMetric.Roi) {
    const volume = Number(BigInt(entry.volume || '0'));
    if (!Number.isFinite(volume) || volume === 0) return 0;
    return Number(BigInt(entry.netPnL || '0')) / volume;
  }
  return Number(BigInt(entry.netPnL || '0'));
};

type TimestampFilter = { gte?: number | null; lte?: number | null } | null;

/**
 * Materialize the ranked address list for a metric. ACCURACY ignores the
 * window (lifetime score); PNL / VOLUME / ROI scope the underlying merged
 * stats to `filter.timestamp`. ROI is sorted in-memory by ratio because
 * the merged set isn't pre-indexed on a `roi` column.
 */
export const rankedAccountsForMetric = async (
  metric: LeaderboardMetric,
  filter?: { timestamp?: TimestampFilter } | null
): Promise<{ address: string; value: string }[]> => {
  const ts = filter?.timestamp ?? null;
  if (metric === LeaderboardMetric.Accuracy) {
    return (await getLeaderboardScores()).map((s) => ({
      address: s.attester,
      value: String(s.accuracyScore),
    }));
  }
  const { fromEpoch, toEpochResolved } = resolveWindow(
    ts?.gte ?? null,
    ts?.lte ?? null
  );
  const entries = await getMerged(fromEpoch, toEpochResolved);
  if (metric === LeaderboardMetric.Roi) {
    return [...entries]
      .sort(
        (a, b) => numericMetricValue(b, metric) - numericMetricValue(a, metric)
      )
      .map((entry) => ({
        address: entry.address,
        value: valueForMetric(entry, metric),
      }));
  }
  const column = metric === LeaderboardMetric.Volume ? 'VOLUME' : 'NET_PNL';
  return rankedFor(entries, column).map((entry) => ({
    address: entry.address,
    value: valueForMetric(entry, metric),
  }));
};
