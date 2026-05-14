/**
 * ConditionGroupsPage field resolvers — lazy `totalCount`.
 */

import type { ConditionGroupsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type ConditionGroupsPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.conditionGroup.count>[0]
  >['where'];
};

export const ConditionGroupsPage: ConditionGroupsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as ConditionGroupsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.conditionGroup.count({ where: p._countWhere });
  },
};
