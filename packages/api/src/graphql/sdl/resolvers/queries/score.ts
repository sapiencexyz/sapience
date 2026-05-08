/**
 * Accuracy-score queries: `accountAccuracy`, `accuracyLeaderboard`,
 * `accountAccuracyRank`.
 *
 * twError in `attester_market_tw_error` now stores (1 - brier) * tau,
 * i.e. an accuracy score where higher is better. The aggregate per
 * attester is averaged across their scored markets; the leaderboard
 * is sorted descending.
 *
 * A small module-scope TTL cache protects the DB from bursts on the
 * leaderboard aggregation (shared between `accuracyLeaderboard` and
 * `accountAccuracyRank`).
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';

const leaderboardCache = new TtlCache<
  string,
  { attester: string; accuracyScore: number }[]
>({ ttlMs: 60_000, maxSize: 1 });

/** Test-only: clear the leaderboard cache between cases. */
export const __clearAccuracyLeaderboardCache = () => leaderboardCache.clear();

const getLeaderboardScores = async (): Promise<
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

type ForecasterScoreShape = {
  address: string;
  numScored: number;
  sumErrorSquared: number;
  numTimeWeighted: number;
  sumTimeWeightedError: number;
  accuracyScore: number;
};

export const sliceAccuracyLeaderboard = async (
  take: number | null | undefined,
  skip: number | null | undefined
): Promise<{
  items: ForecasterScoreShape[];
  hasMore: boolean;
  totalCount: number;
}> => {
  const capped = Math.max(1, Math.min(take ?? 10, 100));
  const skipVal = skip ?? 0;
  const scores = await getLeaderboardScores();
  const items = scores.slice(skipVal, skipVal + capped).map((s) => ({
    address: s.attester,
    numScored: 0,
    sumErrorSquared: 0,
    numTimeWeighted: 0,
    sumTimeWeightedError: 0,
    accuracyScore: s.accuracyScore,
  }));
  const hasMore = scores.length > skipVal + capped;
  return { items, hasMore, totalCount: scores.length };
};

export const accuracyLeaderboardPage: NonNullable<
  QueryResolvers['accuracyLeaderboardPage']
> = async (_parent, { take, skip }) => {
  return sliceAccuracyLeaderboard(take, skip);
};

export const accountAccuracyRank: NonNullable<
  QueryResolvers['accountAccuracyRank']
> = async (_parent, { address }) => {
  const target = address.toLowerCase();
  const scores = await getLeaderboardScores();
  const totalForecasters = scores.length;
  const idx = scores.findIndex((s) => s.attester === target);
  return {
    address: target,
    accuracyScore: idx >= 0 ? scores[idx].accuracyScore : 0,
    rank: idx >= 0 ? idx + 1 : null,
    totalForecasters,
  };
};
