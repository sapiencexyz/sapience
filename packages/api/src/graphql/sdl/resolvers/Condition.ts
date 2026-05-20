/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Condition model resolvers.
 *
 * Relation strategy:
 *  - `category` / `conditionGroup`: FK lives on the parent
 *    (`categoryId` / `conditionGroupId`), so a per-request DataLoader
 *    batches the lookup by integer pk. Pre-loaded relations (Prisma
 *    `include`) still take the fast path via `loadRelation`.
 *  - `predictionsConnection` / `trades` / `forecasts`: Relay-shaped child
 *    connections; we delegate to the root connection resolvers with the
 *    parent scope merged into `filter`.
 */

import type { ConditionResolvers } from '../__generated__/resolvers';
import { ConditionOutcome } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { loadRelation } from './relationHelpers';
import { predictionsConnection } from './queries/escrow';
import { tradesConnection } from './queries/trade';
import { forecastsConnection } from './queries/crud';

export const tokensForConditionIds = async (
  conditionIds: string[]
): Promise<string[]> => {
  const ids = Array.from(
    new Set(conditionIds.map((id) => id.toLowerCase()).filter(Boolean))
  );
  if (ids.length === 0) return [];
  const rows = await prisma.pick.findMany({
    where: { conditionId: { in: ids } },
    select: {
      pickConfiguration: {
        select: { predictorToken: true, counterpartyToken: true },
      },
    },
  });
  return Array.from(
    new Set(
      rows
        .flatMap((r) => [
          r.pickConfiguration?.predictorToken,
          r.pickConfiguration?.counterpartyToken,
        ])
        .filter(Boolean)
        .map((t) => t!.toLowerCase())
    )
  );
};

type PrismaCondition = {
  id: string;
  categoryId?: number | null;
  conditionGroupId?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  resolver?: string;
  category?: unknown;
  conditionGroup?: unknown;
  [k: string]: unknown;
};

export const Condition: ConditionResolvers = {
  marketAddress: (parent) => (parent as PrismaCondition).resolver ?? '',

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

  predictionsConnection: (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    return (predictionsConnection as any)(
      parent,
      { ...args, filter: { ...(args.filter ?? {}), conditionId: p.id } },
      ctx,
      info
    );
  },

  trades: async (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    const tokens = await tokensForConditionIds([p.id]);
    return (tradesConnection as any)(
      parent,
      { ...args, filter: { ...(args.filter ?? {}), tokens } },
      ctx,
      info
    );
  },

  forecasts: (parent, args, ctx, info) => {
    const p = parent as PrismaCondition;
    return (forecastsConnection as any)(
      parent,
      { ...args, filter: { ...(args.filter ?? {}), conditionId: p.id } },
      ctx,
      info
    );
  },
};
