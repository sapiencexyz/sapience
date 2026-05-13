/**
 * Accuracy-score queries: `accuracyLeaderboardPage` and `accountAccuracyRank`.
 *
 * twError in `attester_market_tw_error` now stores (1 - brier) * tau,
 * i.e. an accuracy score where higher is better. The aggregate per
 * attester is averaged across their scored markets; the leaderboard
 * is sorted descending.
 *
 * A small module-scope TTL cache protects the DB from bursts on the
 * leaderboard aggregation (shared between `accuracyLeaderboardPage`
 * and `accountAccuracyRank`).
 */

import type { GraphQLResolveInfo } from 'graphql';
import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { TtlCache } from '../../../../lib/ttlCache';

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

/** Did the client select `totalCount` on this `*Page` field? */
const wantsTotalCount = (info: GraphQLResolveInfo): boolean => {
  const sel = info.fieldNodes[0]?.selectionSet?.selections ?? [];
  return sel.some(
    (s) =>
      s.kind === 'Field' &&
      (s as { name: { value: string } }).name.value === 'totalCount'
  );
};

const MAX_TAKE = 100;
const MAX_SKIP = 1000;

export const accuracyLeaderboardPage: NonNullable<
  QueryResolvers['accuracyLeaderboardPage']
> = async (_parent, { take, skip }, _ctx, info) => {
  const cappedTake = Math.max(1, Math.min(take, MAX_TAKE));
  const cappedSkip = Math.max(0, Math.min(skip, MAX_SKIP));
  const scores = await getLeaderboardScores();
  const items = scores
    .slice(cappedSkip, cappedSkip + cappedTake)
    .map((s) => ({ address: s.attester, accuracyScore: s.accuracyScore }));
  const hasMore = cappedSkip + items.length < scores.length;
  const totalCount = wantsTotalCount(info) ? scores.length : null;
  return { items, hasMore, totalCount };
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
