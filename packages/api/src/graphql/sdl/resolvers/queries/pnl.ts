/**
 * PnL queries: `profitLeaderboard`, `accountProfitRank`.
 *
 * Both share a 60s TTL cache of the fully aggregated leaderboard
 * computed by `calculateCombinedPositionPnL` (which spans both the
 * legacy `position` table and the `Prediction` table). The leaderboard
 * is small enough to hold in memory; ranking is a trivial index
 * lookup once cached.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import { TtlCache } from '../../../../lib/ttlCache';
import { calculateCombinedPositionPnL } from '../../../../services/positionPnL';
import { clampSkip, clampTake } from './pagination';

const DEFAULT_DECIMALS = 18;

interface LeaderboardEntry {
  address: string;
  totalPnL: string;
}

const leaderboardCache = new TtlCache<string, LeaderboardEntry[]>({
  ttlMs: 60_000,
  maxSize: 10,
});
/** Key includes version suffix so old caches invalidate across deploys. */
const CACHE_KEY = 'profitLeaderboard:v5';

/** Test-only: clear the leaderboard cache between cases. */
export const __clearProfitLeaderboardCache = () => leaderboardCache.clear();

export const getFullLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const existing = leaderboardCache.get(CACHE_KEY);
  if (existing) return existing;
  const positionPnL = await calculateCombinedPositionPnL();
  const aggregated = new Map<string, number>();
  for (const r of positionPnL) {
    const addr = r.owner.toLowerCase();
    const divisor = Math.pow(10, DEFAULT_DECIMALS);
    const val = parseFloat(r.totalPnL) / divisor;
    if (!Number.isFinite(val)) continue;
    aggregated.set(addr, (aggregated.get(addr) || 0) + val);
  }
  const entries = Array.from(aggregated.entries())
    .map(([address, pnl]) => ({ address, totalPnL: pnl.toFixed(18) }))
    .sort((a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL));
  leaderboardCache.set(CACHE_KEY, entries);
  return entries;
};

export const sliceLeaderboard = async (
  take: number | null | undefined,
  skip: number | null | undefined
): Promise<{
  items: LeaderboardEntry[];
  hasMore: boolean;
  totalCount: number;
}> => {
  const entries = await getFullLeaderboard();
  const cappedTake = clampTake(take, { defaultTake: 10, maxTake: 100 });
  const skipVal = clampSkip(skip);
  const items = entries.slice(skipVal, skipVal + cappedTake);
  const hasMore = entries.length > skipVal + cappedTake;
  return { items, hasMore, totalCount: entries.length };
};

export const profitLeaderboardPage: NonNullable<
  QueryResolvers['profitLeaderboardPage']
> = async (_parent, { take, skip }) => {
  return sliceLeaderboard(take, skip);
};
