/**
 * Pick model resolvers.
 *
 * Pick has no Prisma relation to Condition (only a foreign-key column),
 * so the `condition` field can't ride on Prisma's `include`. The
 * `conditionById` DataLoader on `ctx.loaders` batches every Pick.condition
 * lookup in a request into a single `findMany`, also pre-warming the
 * `category` relation so `Condition.category` doesn't N+1 either. The
 * fallback `findUnique` only fires when the loader isn't on context
 * (some unit tests don't wire one).
 */

import type { PickResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PrismaPick = { conditionId: string };

export const Pick: PickResolvers = {
  condition: async (parent, _args, ctx) => {
    const conditionId = (parent as PrismaPick).conditionId;
    if (!conditionId) return null;
    if (ctx.loaders) return ctx.loaders.conditionById.load(conditionId);
    return prisma.condition.findUnique({
      where: { id: conditionId },
      include: { category: true },
    });
  },
};
