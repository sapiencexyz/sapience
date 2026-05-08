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
  limit: number | null | undefined,
  skip: number | null | undefined
): Promise<{ items: LeaderboardEntry[]; hasMore: boolean }> => {
  const entries = await getFullLeaderboard();
  const cappedLimit = Math.max(1, Math.min(limit ?? 10, 100));
  const skipVal = skip ?? 0;
  const items = entries.slice(skipVal, skipVal + cappedLimit);
  const hasMore = entries.length > skipVal + cappedLimit;
  return { items, hasMore };
};

export const profitLeaderboardPage: NonNullable<
  QueryResolvers['profitLeaderboardPage']
> = async (_parent, { limit, skip }) => {
  return sliceLeaderboard(limit, skip);
};
