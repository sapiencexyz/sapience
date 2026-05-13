/**
 * PickConfigurationsPage field resolvers.
 *
 * `totalCount` is lazy: `runPickConfigurations` returns the matching
 * where clause as `_countWhere` rather than running an eager count, so
 * the `prisma.picks.count(...)` query only fires when the client
 * actually selects `totalCount`. Mirrors PredictionsPage / PositionsPage.
 */

import type { PickConfigurationsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PickConfigurationsPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<Parameters<typeof prisma.picks.count>[0]>['where'];
};

export const PickConfigurationsPage: PickConfigurationsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as PickConfigurationsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.picks.count({ where: p._countWhere });
  },
};
