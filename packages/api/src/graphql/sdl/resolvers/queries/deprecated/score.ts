/**
 * Deprecated accuracy queries:
 *
 *   - accuracyLeaderboard — replaced by `accuracyLeaderboardPage`.
 *   - accountAccuracy — unused; will be removed (the live
 *     `accountAccuracyRank` covers the rank-lookup case; this returned
 *     a per-address aggregate that no client consumes).
 *
 * accountAccuracy is self-contained (separate DB query, no shared
 * helper). accuracyLeaderboard reuses `sliceAccuracyLeaderboard` from
 * the live file.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import prisma from '../../../../../core/db';
import { sliceAccuracyLeaderboard } from '../score';

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
  const { items } = await sliceAccuracyLeaderboard(limit, 0);
  return items;
};
