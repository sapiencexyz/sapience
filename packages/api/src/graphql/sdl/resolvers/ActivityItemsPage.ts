/**
 * ActivityItemsPage field resolvers.
 *
 * `totalCount` is null by default — the activity feed merges
 * predictions + secondary trades and ranks them by timestamp; a
 * precise count would require two independent count queries plus the
 * scoping logic. Surfacing it cheaply is a future enhancement.
 */

import type { ActivityItemsPageResolvers } from '../__generated__/resolvers';

type ActivityItemsPageParent = {
  totalCount?: number | null;
};

export const ActivityItemsPage: ActivityItemsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as ActivityItemsPageParent;
    return typeof p.totalCount === 'number' ? p.totalCount : null;
  },
};
