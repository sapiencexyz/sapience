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
 *   2. **To-many batch** (`<thing>By<ParentFk>`): one batched `findMany`
 *      that fans out the parent FK and groups the result. Drives
 *      `Condition.attestations` when the caller doesn't pass per-row
 *      pagination/filter args. With args (take/skip/where/orderBy/cursor/
 *      distinct) the loader can't honor per-parent slicing, so the field
 *      resolver falls through to the per-row path.
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
type AttestationRow = Prisma.AttestationGetPayload<true>;

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

  // To-many batch loaders (FK → child rows). Always returns an array;
  // empty array for parents with no matching children.
  /** conditionId → Attestation rows for that condition. */
  attestationsByConditionId: DataLoader<string, AttestationRow[]>;
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

  attestationsByConditionId: new DataLoader<string, AttestationRow[]>(
    async (conditionIds) => {
      const lowered = conditionIds.map((id) => id.toLowerCase());
      const rows = await prisma.attestation.findMany({
        where: { conditionId: { in: Array.from(new Set(lowered)) } },
      });
      const byCondId = new Map<string, AttestationRow[]>();
      for (const row of rows) {
        if (!row.conditionId) continue;
        const k = row.conditionId.toLowerCase();
        const arr = byCondId.get(k);
        if (arr) arr.push(row);
        else byCondId.set(k, [row]);
      }
      return conditionIds.map((id) => byCondId.get(id.toLowerCase()) ?? []);
    }
  ),
});
