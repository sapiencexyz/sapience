/**
 * ConditionGroupsPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { ConditionGroupsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const ConditionGroupsPage: ConditionGroupsPageResolvers = {
  totalCount: lazyTotalCount(prisma.conditionGroup),
};
