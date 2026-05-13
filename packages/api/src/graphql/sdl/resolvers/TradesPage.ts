/**
 * TradesPage field resolvers — lazy `totalCount` follows the
 * PredictionsPage / PositionsPage pattern.
 */

import type { TradesPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type TradesPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.secondaryTrade.count>[0]
  >['where'];
};

export const TradesPage: TradesPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as TradesPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.secondaryTrade.count({ where: p._countWhere });
  },
};
