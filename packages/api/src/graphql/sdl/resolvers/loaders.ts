/**
 * Per-request DataLoaders for the GraphQL layer.
 *
 * A new instance is created for each request in the Apollo context
 * factory (`packages/api/src/core/server.ts`). DataLoaders are
 * intentionally request-scoped — a long-lived loader would cache rows
 * across requests, which conflicts with read-after-write expectations
 * in mutation flows.
 *
 * Two loader families:
 *
 *   1. **Single-key** (`<thing>ById` / `userByAddress`): one batched
 *      `findMany` per request, deduped by key. Drives both top-level
 *      single-entity queries (`Query.condition(id:)`, `Query.user(address:)`)
 *      and field resolvers that hold the FK on the parent
 *      (`Condition.category`, `Condition.conditionGroup`,
 *      `User.referredBy`, etc.). The fast `parent[relation]` check still
 *      runs first, so anything threaded through Prisma `include` skips
 *      the loader entirely.
 *
 * Loaders that aren't keyed by a single id (list queries with non-id
 * filters — `escrow.ts:runPickConfigurations`, `activity.ts` token-set
 * lookup) intentionally bypass this module — DataLoader's keyed model
 * doesn't fit them.
 */

import DataLoader from 'dataloader';
import type { Prisma } from '../../../../generated/prisma';
import type prismaClient from '../../../core/db';

type PicksRow = Prisma.PicksGetPayload<{ include: { picks: true } }>;
type ConditionRow = Prisma.ConditionGetPayload<{
  include: { category: true };
}>;
type UserRow = Prisma.UserGetPayload<true>;
type CategoryRow = Prisma.CategoryGetPayload<true>;
type ConditionGroupRow = Prisma.ConditionGroupGetPayload<true>;
type ReferralCodeRow = Prisma.ReferralCodeGetPayload<true>;
type PickRow = Prisma.PickGetPayload<true>;

export interface GraphQLLoaders {
  // Single-key loaders
  /** id → Condition row (with `category`), or null when missing. */
  conditionById: DataLoader<string, ConditionRow | null>;
  /** address → User row, or null when missing. */
  userByAddress: DataLoader<string, UserRow | null>;
  /** id → Picks row (with nested `picks: Pick[]`), or null when missing. */
  pickConfigById: DataLoader<string, PicksRow | null>;
  /** id → Category row, or null when missing. */
  categoryById: DataLoader<number, CategoryRow | null>;
  /** id → ConditionGroup row, or null when missing. */
  conditionGroupById: DataLoader<number, ConditionGroupRow | null>;
  /** id → User row by integer pk (distinct from `userByAddress`). */
  userById: DataLoader<number, UserRow | null>;
  /** id → ReferralCode row, or null when missing. */
  referralCodeById: DataLoader<number, ReferralCodeRow | null>;
  /**
   * conditionGroupId → ordered Condition[] (`displayOrder` asc nulls
   * last, then `createdAt` asc). Used by v2 `ConditionGroup.conditions`
   * to fold a per-row count + findMany into a single batched fetch.
   */
  conditionsByGroupId: DataLoader<number, ConditionRow[]>;
  /**
   * pickConfigId → Pick[] for that configuration. Used by v2
   * `PickConfiguration.picks` when the parent row didn't carry an
   * eager `picks` include.
   */
  picksByPickConfigId: DataLoader<string, PickRow[]>;
  /**
   * referrerUserId → referred User[]. Used by v2 `Account.referrals`
   * to fold the per-parent `count + findMany` into a single batched
   * fetch across many parent rows.
   */
  usersByReferrerId: DataLoader<number, UserRow[]>;
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

  categoryById: new DataLoader<number, CategoryRow | null>(async (ids) => {
    const rows = await prisma.category.findMany({
      where: { id: { in: Array.from(new Set(ids)) } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id) ?? null);
  }),

  conditionGroupById: new DataLoader<number, ConditionGroupRow | null>(
    async (ids) => {
      const rows = await prisma.conditionGroup.findMany({
        where: { id: { in: Array.from(new Set(ids)) } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null);
    }
  ),

  userById: new DataLoader<number, UserRow | null>(async (ids) => {
    const rows = await prisma.user.findMany({
      where: { id: { in: Array.from(new Set(ids)) } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id) ?? null);
  }),

  referralCodeById: new DataLoader<number, ReferralCodeRow | null>(
    async (ids) => {
      const rows = await prisma.referralCode.findMany({
        where: { id: { in: Array.from(new Set(ids)) } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null);
    }
  ),

  conditionsByGroupId: new DataLoader<number, ConditionRow[]>(async (ids) => {
    const rows = await prisma.condition.findMany({
      where: { conditionGroupId: { in: Array.from(new Set(ids)) } },
      include: { category: true },
      orderBy: [
        { displayOrder: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });
    const byGroupId = new Map<number, ConditionRow[]>();
    for (const row of rows) {
      if (row.conditionGroupId == null) continue;
      const bucket = byGroupId.get(row.conditionGroupId) ?? [];
      bucket.push(row);
      byGroupId.set(row.conditionGroupId, bucket);
    }
    return ids.map((id) => byGroupId.get(id) ?? []);
  }),

  picksByPickConfigId: new DataLoader<string, PickRow[]>(async (ids) => {
    const lowered = ids.map((id) => id.toLowerCase());
    const rows = await prisma.pick.findMany({
      where: { pickConfigId: { in: Array.from(new Set(lowered)) } },
    });
    const byConfigId = new Map<string, PickRow[]>();
    for (const row of rows) {
      const bucket = byConfigId.get(row.pickConfigId) ?? [];
      bucket.push(row);
      byConfigId.set(row.pickConfigId, bucket);
    }
    return ids.map((id) => byConfigId.get(id.toLowerCase()) ?? []);
  }),

  usersByReferrerId: new DataLoader<number, UserRow[]>(async (ids) => {
    const rows = await prisma.user.findMany({
      where: { referredById: { in: Array.from(new Set(ids)) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const byReferrerId = new Map<number, UserRow[]>();
    for (const row of rows) {
      if (row.referredById == null) continue;
      const bucket = byReferrerId.get(row.referredById) ?? [];
      bucket.push(row);
      byReferrerId.set(row.referredById, bucket);
    }
    return ids.map((id) => byReferrerId.get(id) ?? []);
  }),
});
