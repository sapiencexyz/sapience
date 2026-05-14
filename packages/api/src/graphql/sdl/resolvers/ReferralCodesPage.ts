/**
 * ReferralCodesPage field resolvers — lazy `totalCount` follows the
 * PredictionsPage / PositionsPage pattern. There are no filter args on
 * `referralCodesPage`, so the count is always over the full
 * ReferralCode table; the `_countWhere` envelope is kept as a hook for
 * future filter args.
 */

import type { ReferralCodesPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type ReferralCodesPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.referralCode.count>[0]
  >['where'];
};

export const ReferralCodesPage: ReferralCodesPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as ReferralCodesPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.referralCode.count({ where: p._countWhere });
  },
};
