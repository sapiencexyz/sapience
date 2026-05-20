/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Condition model resolvers.
 *
 * GraphQL field names match Prisma relation names for Condition —
 * `category`, `conditionGroup`, `attestations`, `predictions` — so no
 * rename bookkeeping. Scalar fields pass through the default field
 * resolver.
 *
 * Relation strategy:
 *  - `category` / `conditionGroup`: FK lives on the parent
 *    (`categoryId` / `conditionGroupId`), so a per-request DataLoader
 *    batches the lookup by integer pk. Pre-loaded relations (Prisma
 *    `include`) still take the fast path via `loadRelation`.
 *  - `attestations` / `predictions`: to-many relations. A batched
 *    `findMany({ where: { conditionId: { in } } })` loader fans out the
 *    parent ids when the caller doesn't supply per-row pagination/filter
 *    args. With args present the loader can't honor per-parent slicing,
 *    so we fall through to the legacy per-row path.
 */

import type { ConditionResolvers } from '../__generated__/resolvers';
import { ConditionOutcome } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';
import { predictionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';
import { forecastsConnection } from './queries/crud';

type PrismaCondition = {
  id: string;
  categoryId?: number | null;
  conditionGroupId?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  category?: unknown;
  conditionGroup?: unknown;
  attestations?: unknown;
  predictions?: unknown;
  [k: string]: unknown;
};

type RelationListArgs = {
  cursor?: unknown;
  distinct?: unknown;
  orderBy?: unknown;
  skip?: number | null;
  take?: number | null;
  where?: unknown;
};

const isBatchableListArgs = (args: RelationListArgs | undefined | null) =>
  !args ||
  (args.where == null &&
    args.orderBy == null &&
    args.cursor == null &&
    args.distinct == null &&
    args.skip == null &&
    args.take == null);

export const Condition: ConditionResolvers = {
  /**
   * Derived `outcome` enum — null while unsettled, otherwise mapped
   * from the boolean state. `nonDecisive` wins over `resolvedToYes`
   * because the protocol treats voided settlements as collapsing to
   * the counterparty regardless of the YES/NO bit.
   */
  outcome: (parent) => {
    const p = parent as PrismaCondition;
    if (p.settled !== true) return null;
    if (p.nonDecisive === true) return ConditionOutcome.NonDecisive;
    return p.resolvedToYes ? ConditionOutcome.Yes : ConditionOutcome.No;
  },

  category: async (parent, args, ctx) => {
    const p = parent as PrismaCondition;
    if (p.category !== undefined) return p.category as never;
    if (p.categoryId == null) return null;
    if (ctx.loaders) return ctx.loaders.categoryById.load(p.categoryId);
    return loadRelation(p, 'category', {
      parentModel: 'condition',
      parentWhere: { id: p.id },
      prismaRelationName: 'category',
      args,
    });
  },

  conditionGroup: async (parent, args, ctx) => {
    const p = parent as PrismaCondition;
    if (p.conditionGroup !== undefined) return p.conditionGroup as never;
    if (p.conditionGroupId == null) return null;
    if (ctx.loaders)
      return ctx.loaders.conditionGroupById.load(p.conditionGroupId);
    return loadRelation(p, 'conditionGroup', {
      parentModel: 'condition',
      parentWhere: { id: p.id },
      prismaRelationName: 'conditionGroup',
      args,
    });
  },

  attestations: async (parent, args, ctx) => {
    const p = parent as PrismaCondition;
    if (Array.isArray(p.attestations)) return p.attestations as never[];
    if (ctx.loaders && isBatchableListArgs(args as RelationListArgs)) {
      return ctx.loaders.attestationsByConditionId.load(p.id) as never;
    }
    return loadRelation(p, 'attestations', {
      parentModel: 'condition',
      parentWhere: { id: p.id },
      prismaRelationName: 'attestations',
      args,
    });
  },

  predictions: (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    return (predictionsConnection as any)(parent, { ...args, filter: { ...(args.filter ?? {}), conditionId: p.id } }, ctx, info);
  },

  trades: (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    return (tradesConnection as any)(parent, { ...args, filter: { ...(args.filter ?? {}), token: null } }, ctx, info);
  },

  forecasts: (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    return (forecastsConnection as any)(parent, { ...args, filter: { ...(args.filter ?? {}), conditionId: p.id } }, ctx, info);
  },
};
