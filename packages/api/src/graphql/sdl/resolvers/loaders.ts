/**
 * Per-request DataLoaders for the GraphQL layer.
 *
 * A new instance is created for each request in the Apollo context
 * factory (`packages/api/src/core/server.ts`). DataLoaders are
 * intentionally request-scoped — a long-lived loader would cache rows
 * across requests, which conflicts with read-after-write expectations
 * in mutation flows.
 *
 * Three keyed lookups, each backed by a single batched `findMany`:
 *
 *   1. `conditionById`  — drives `Pick.condition` and `Query.condition`.
 *      Picks have no Prisma relation to Condition (only an FK column),
 *      so the field resolver can't ride on `include`. Multiple Picks on
 *      a page that reference the same Condition share one round trip;
 *      different Picks across the same request also batch into the same
 *      `findMany` because all the field resolutions happen in one tick.
 *      The category relation is included so `Condition.category` is
 *      pre-warmed too — no second N+1.
 *   2. `userByAddress`  — drives `Query.user` and any future per-address
 *      lookup. Address-keyed (lowercased on enqueue).
 *   3. `pickConfigById` — drives the deprecated `pickConfiguration(id)`
 *      single lookup; same shape as the list query (`include: picks`).
 *
 * Other lookups (e.g. `escrow.ts:runPickConfigurations` list query,
 * `activity.ts` token-set lookup) intentionally bypass these loaders —
 * they have non-id filters that DataLoader's keyed model doesn't fit.
 */

import DataLoader from 'dataloader';
import type { Prisma } from '../../../../generated/prisma';
import type prismaClient from '../../../core/db';

type PicksRow = Prisma.PicksGetPayload<{ include: { picks: true } }>;
type ConditionRow = Prisma.ConditionGetPayload<{
  include: { category: true };
}>;
type UserRow = Prisma.UserGetPayload<true>;

export interface GraphQLLoaders {
  /** id → Condition row (with `category`), or null when missing. */
  conditionById: DataLoader<string, ConditionRow | null>;
  /** address → User row, or null when missing. */
  userByAddress: DataLoader<string, UserRow | null>;
  /** id → Picks row (with nested `picks: Pick[]`), or null when missing. */
  pickConfigById: DataLoader<string, PicksRow | null>;
}

export const createLoaders = (prisma: typeof prismaClient): GraphQLLoaders => ({
  conditionById: new DataLoader<string, ConditionRow | null>(async (ids) => {
    // Conditions are stored with normalized-case ids; callers that pass
    // mixed case still resolve correctly. Lowercase on the way in, then
    // map back to original-key positions for the DataLoader contract.
    const lowered = ids.map((id) => id.toLowerCase());
    const rows = await prisma.condition.findMany({
      where: { id: { in: Array.from(new Set(lowered)) } },
      include: { category: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id.toLowerCase()) ?? null);
  }),

  userByAddress: new DataLoader<string, UserRow | null>(async (addresses) => {
    const lowered = addresses.map((a) => a.toLowerCase());
    const rows = await prisma.user.findMany({
      where: { address: { in: Array.from(new Set(lowered)) } },
    });
    const byAddress = new Map(rows.map((r) => [r.address, r]));
    return addresses.map((a) => byAddress.get(a.toLowerCase()) ?? null);
  }),

  pickConfigById: new DataLoader<string, PicksRow | null>(async (ids) => {
    const lowered = ids.map((id) => id.toLowerCase());
    const rows = await prisma.picks.findMany({
      where: { id: { in: Array.from(new Set(lowered)) } },
      include: { picks: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id.toLowerCase()) ?? null);
  }),
});
