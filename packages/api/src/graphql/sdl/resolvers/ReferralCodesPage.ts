/**
 * ReferralCodesPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract. There are no
 * filter args on `referralCodesPage` today, so the count is always over
 * the full ReferralCode table; the `_countWhere` envelope is kept as a
 * hook for future filters.
 */

import type { ReferralCodesPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const ReferralCodesPage: ReferralCodesPageResolvers = {
  totalCount: lazyTotalCount(prisma.referralCode),
};
