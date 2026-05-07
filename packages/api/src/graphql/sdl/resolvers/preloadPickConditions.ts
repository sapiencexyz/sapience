/**
 * Batch-load every Condition referenced by a set of Picks rows into
 * `ctx.pickConditions`. The Pick.condition field resolver reads this
 * cache, so all the picks on a request share a single
 * `prisma.condition.findMany({ where: { id: { in: [...] } } })` instead
 * of falling back to per-pick `findUnique` calls.
 *
 * Callers pass the array of `Picks` rows (with their `picks` Pick[] children
 * included) returned from any list/single Prisma fetch. The helper is a
 * no-op when ctx is missing or the rows reference no conditions.
 */
import type { ApolloContext } from '../../startApolloServer';
import prisma from '../../../core/db';

type PicksRow = { picks: { conditionId: string }[] };

export const preloadPickConditions = async (
  ctx: ApolloContext | undefined,
  rows: ReadonlyArray<PicksRow | null | undefined>
): Promise<void> => {
  const cache = ctx?.pickConditions;
  if (!cache) return;

  const need = new Set<string>();
  for (const row of rows) {
    for (const p of row?.picks ?? []) {
      if (p.conditionId && !cache.has(p.conditionId)) {
        need.add(p.conditionId);
      }
    }
  }
  if (need.size === 0) return;

  const conditions = await prisma.condition.findMany({
    where: { id: { in: Array.from(need) } },
    include: { category: true },
  });
  for (const c of conditions) cache.set(c.id, c);
};
