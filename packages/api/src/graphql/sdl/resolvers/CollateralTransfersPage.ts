/**
 * CollateralTransfersPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { CollateralTransfersPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const CollateralTransfersPage: CollateralTransfersPageResolvers = {
  totalCount: lazyTotalCount(prisma.collateralTransfer),
};
