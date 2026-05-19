/**
 * PositionsPage field resolvers. `totalCount` counts raw Position rows, not
 * synthesized event-stream rows; the root resolver stashes `_countWhere` so the
 * count query is only paid when the client actually selects this field.
 */

import type { PositionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const PositionsPage: PositionsPageResolvers = {
  totalCount: lazyTotalCount(prisma.position),
};
