/**
 * PredictionsPage field resolvers. `totalCount` is lazy — see
 * `lazyTotalCount` for the shared `_countWhere` contract.
 */

import type { PredictionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const PredictionsPage: PredictionsPageResolvers = {
  totalCount: lazyTotalCount(prisma.prediction),
};
