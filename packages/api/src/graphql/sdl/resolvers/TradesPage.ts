/**
 * TradesPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { TradesPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const TradesPage: TradesPageResolvers = {
  totalCount: lazyTotalCount(prisma.secondaryTrade),
};
