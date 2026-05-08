/**
 * Per-request DataLoaders for the GraphQL layer.
 *
 * A new instance is created for each request in the Apollo context
 * factory (`packages/api/src/core/server.ts`). DataLoaders are
 * intentionally request-scoped — a long-lived loader would cache rows
 * across requests, which conflicts with read-after-write expectations
 * in mutation flows.
 *
 * Today this is a thin shim around `prisma.picks.findMany({ where: {
 * id: { in: keys } } })`. The real value is structural:
 *
 *   1. Multiple resolvers in one request that ask for the same
 *      `pickConfiguration` by id share a single round trip — Prisma
 *      lookups become idempotent within a request.
 *   2. New resolvers can call `ctx.loaders.pickConfigById.load(id)`
 *      without each having to think about batching.
 *   3. The deprecated `pickConfiguration(id)` resolver gets free
 *      dedup if a query happens to reference the same config from
 *      multiple paths.
 *
 * Other picks lookups (`escrow.ts:runPickConfigurations` list query,
 * `activity.ts` token-set lookup) intentionally bypass this — they
 * have non-id filters and DataLoader's keyed model doesn't fit.
 */

import DataLoader from 'dataloader';
import type { Prisma } from '../../../../generated/prisma';
import type prismaClient from '../../../core/db';

type PicksRow = Prisma.PicksGetPayload<{ include: { picks: true } }>;

export interface GraphQLLoaders {
  /** id → Picks row (with nested `picks: Pick[]`), or null when missing. */
  pickConfigById: DataLoader<string, PicksRow | null>;
}

export const createLoaders = (prisma: typeof prismaClient): GraphQLLoaders => ({
  pickConfigById: new DataLoader<string, PicksRow | null>(async (ids) => {
    const lowered = ids.map((id) => id.toLowerCase());
    const rows = await prisma.picks.findMany({
      where: { id: { in: lowered } },
      include: { picks: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // DataLoader contract: return one entry per input key, in input order.
    return ids.map((id) => byId.get(id.toLowerCase()) ?? null);
  }),
});
