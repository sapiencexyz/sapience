/**
 * CollateralTransfersPage field resolvers — lazy `totalCount`.
 */

import type { CollateralTransfersPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type CollateralTransfersPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.collateralTransfer.count>[0]
  >['where'];
};

export const CollateralTransfersPage: CollateralTransfersPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as CollateralTransfersPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.collateralTransfer.count({ where: p._countWhere });
  },
};
