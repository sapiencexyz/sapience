/**
 * ConditionsPage field resolvers — lazy `totalCount` follows the
 * PredictionsPage / PositionsPage pattern.
 */

import type { ConditionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type ConditionsPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.condition.count>[0]
  >['where'];
};

export const ConditionsPage: ConditionsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as ConditionsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.condition.count({ where: p._countWhere });
  },
};
