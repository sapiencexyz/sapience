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
import prisma from '../../../../db';
import { TtlCache } from '../../../../utils/ttlCache';

const leaderboardCache = new TtlCache<
  string,
  { attester: string; accuracyScore: number }[]
>({ ttlMs: 60_000, maxSize: 1 });

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

export const accountAccuracy: NonNullable<
  QueryResolvers['accountAccuracy']
> = async (_parent, { address }) => {
  const a = address.toLowerCase();
  const rows = await prisma.attesterMarketTwError.findMany({
    where: { attester: a },
    select: { twError: true },
  });
  if (rows.length === 0) return null;
  const numTimeWeighted = rows.length;
  const sumTimeWeightedError = rows.reduce(
    (acc, r) => acc + (r.twError || 0),
    0
  );
  return {
    address: a,
    numScored: 0,
    sumErrorSquared: 0,
    numTimeWeighted,
    sumTimeWeightedError,
    accuracyScore: sumTimeWeightedError / numTimeWeighted,
  };
};

export const accuracyLeaderboard: NonNullable<
  QueryResolvers['accuracyLeaderboard']
> = async (_parent, { limit }) => {
  const capped = Math.max(1, Math.min(limit, 100));
  const scores = await getLeaderboardScores();
  return scores.slice(0, capped).map((s) => ({
    address: s.attester,
    numScored: 0,
    sumErrorSquared: 0,
    numTimeWeighted: 0,
    sumTimeWeightedError: 0,
    accuracyScore: s.accuracyScore,
  }));
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
