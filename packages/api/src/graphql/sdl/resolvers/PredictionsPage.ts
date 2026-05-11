/**
 * PredictionsPage field resolvers.
 *
 * `totalCount` is lazy: `runPredictions` returns the matching where
 * clause as `_countWhere` rather than running an eager count, so the
 * `prisma.prediction.count(...)` query only fires when the client
 * actually selects `totalCount`. The deprecated bare-array
 * `predictions` wrapper discards the envelope's totalCount and never
 * reaches this resolver, so it gets the count-skip for free.
 */

import type { PredictionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PredictionsPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.prediction.count>[0]
  >['where'];
};

export const PredictionsPage: PredictionsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as PredictionsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.prediction.count({ where: p._countWhere });
  },
};
