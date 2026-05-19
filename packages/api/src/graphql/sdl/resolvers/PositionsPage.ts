/**
 * PositionsPage field resolvers.
 *
 * `totalCount` is lazy via `lazyTotalCount` — `runPositions` populates
 * `_countWhere` so the COUNT(*) only fires when the client selects the
 * field. The count is the number of underlying Position rows matching
 * the filters (not the count of rendered event-stream rows, which can
 * be larger due to per-sell synthetic expansion).
 */

import type { PositionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { lazyTotalCount } from './pageTotalCount';

export const PositionsPage: PositionsPageResolvers = {
  totalCount: lazyTotalCount(prisma.position),
};
