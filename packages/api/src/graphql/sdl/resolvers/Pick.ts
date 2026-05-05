/**
 * Pick model resolvers.
 *
 * Pick has no Prisma relation to Condition (only a foreign-key column),
 * so the `condition` field can't ride on Prisma's `include` like the
 * other relation resolvers. Two paths:
 *
 *   1. Fast path — resolvers that return Pick rows pre-populate
 *      `ctx.pickConditions` with the conditions referenced by every
 *      pick on the page. The field resolver returns the cached row
 *      without a round trip.
 *   2. Fallback — single `prisma.condition.findUnique` by `conditionId`.
 *      N+1 across many Picks; only fires for paths that haven't
 *      pre-populated.
 */

import type { PickResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PrismaPick = { conditionId: string };

export const Pick: PickResolvers = {
  condition: async (parent, _args, ctx) => {
    const conditionId = (parent as PrismaPick).conditionId;
    if (!conditionId) return null;
    const cached = ctx.pickConditions?.get(conditionId);
    if (cached !== undefined) {
      return cached as Awaited<ReturnType<typeof prisma.condition.findUnique>>;
    }
    return prisma.condition.findUnique({ where: { id: conditionId } });
  },
};
