/**
 * ReferralCodeClaimantsPage field resolvers — lazy `totalCount` counts
 * `app_user` rows where `referredByCodeId` matches the parent code id.
 * The parent envelope carries `_codeId` so the count query can run
 * scoped to the right code.
 */

import type { ReferralCodeClaimantsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type ReferralCodeClaimantsPageParent = {
  totalCount?: number | null;
  _codeId?: number;
};

export const ReferralCodeClaimantsPage: ReferralCodeClaimantsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as ReferralCodeClaimantsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (p._codeId == null) return null;
    return prisma.user.count({
      where: { referredByCodeId: p._codeId },
    });
  },
};
