/**
 * Accuracy-score queries: `accuracyLeaderboardPage` and `accountAccuracyRank`.
 *
 * `twError` in `attester_market_tw_error` now stores `(1 - brier) * tau`,
 * i.e. an accuracy score where higher is better. The aggregate per
 * attester is averaged across their scored markets; the leaderboard is
 * sorted descending. The time-weighted error already weights by recency,
 * so there's no window filter on either of these resolvers — accuracy is
 * lifetime-aggregated by design.
 *
 * A small module-scope TTL cache protects the DB from bursts on the
 * leaderboard aggregation (shared between the two resolvers).
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';
import { clampSkip, clampTake } from './pagination';

const leaderboardCache = new TtlCache<
  string,
  { attester: string; accuracyScore: number }[]
>({ ttlMs: 60_000, maxSize: 1 });

export const getLeaderboardScores = async (): Promise<
  { attester: string; accuracyScore: number }[]
> => {
  const cached = leaderboardCache.get('leaderboard');
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
  leaderboardCache.set('leaderboard', scores);
  return scores;
};

const DEFAULT_LEADERBOARD_TAKE = 25;

export const accuracyLeaderboardPage: NonNullable<
  QueryResolvers['accuracyLeaderboardPage']
> = async (_parent, { take, skip }) => {
  const cappedTake = clampTake(take, { defaultTake: DEFAULT_LEADERBOARD_TAKE });
  const cappedSkip = clampSkip(skip);
  const scores = await getLeaderboardScores();
  const items = scores
    .slice(cappedSkip, cappedSkip + cappedTake)
    .map((s) => ({ address: s.attester, accuracyScore: s.accuracyScore }));
  const hasMore = cappedSkip + items.length < scores.length;
  // totalCount is cheap (the in-memory cached array's length), so populate
  // unconditionally — no field-resolver lazy gate needed for this surface.
  return { items, hasMore, totalCount: scores.length };
};

export const accountAccuracyRank: NonNullable<
  QueryResolvers['accountAccuracyRank']
> = async (_parent, { address }) => {
  const target = address.toLowerCase();
  const scores = await getLeaderboardScores();
  const totalParticipants = scores.length;
  const idx = scores.findIndex((s) => s.attester === target);
  return {
    address: target,
    accuracyScore: idx >= 0 ? scores[idx].accuracyScore : 0,
    rank: idx >= 0 ? idx + 1 : null,
    totalParticipants,
  };
};
