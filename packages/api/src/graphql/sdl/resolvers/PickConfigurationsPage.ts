/**
 * PickConfigurationsPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { PickConfigurationsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const PickConfigurationsPage: PickConfigurationsPageResolvers = {
  totalCount: lazyTotalCount(prisma.picks),
};
