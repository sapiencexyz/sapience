/**
 * ConditionGroup model resolvers.
 *
 * `category`: FK on parent (`categoryId`) → batched via `categoryById`
 * DataLoader.
 *
 * `conditions`: deployed behaviour is that hidden conditions never
 * leak — the parent always filters `public: true` even if the caller
 * didn't pass a `where` clause, with `displayOrder ASC` as the default
 * order. The custom args make this field unsafe to batch through a
 * DataLoader, so it stays on the legacy per-row path.
 *
 * GraphQL `conditions` maps to Prisma `condition` (the rename was
 * carried via `@TypeGraphQL.field(name: "conditions")` in
 * schema.prisma on the deployed stack).
 *
 * `negRisk` is a derived boolean — the DB only stores `negRiskMarketId`
 * on the group, and the flag is true exactly when a basket id is set.
 * Keeping it computed (rather than a column) means the two can't drift.
 */

import type { ConditionGroupResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaConditionGroup = {
  id: number;
  name?: string | null;
  categoryId?: number | null;
  category?: unknown;
  negRiskMarketId?: string | null;
  [k: string]: unknown;
};

export const ConditionGroup: ConditionGroupResolvers = {
  title: (parent) => (parent as PrismaConditionGroup).name ?? '',
  category: async (parent, args, ctx) => {
    const p = parent as PrismaConditionGroup;
    if (p.category !== undefined) return p.category as never;
    if (p.categoryId == null) return null;
    if (ctx.loaders) return ctx.loaders.categoryById.load(p.categoryId);
    return loadRelation(p, 'category', {
      parentModel: 'conditionGroup',
      parentWhere: { id: p.id },
      prismaRelationName: 'category',
      args,
    });
  },

  negRisk: (parent) =>
    Boolean((parent as PrismaConditionGroup).negRiskMarketId),

  conditions: async (parent, args) => {
    const p = parent as PrismaConditionGroup;
    if (Array.isArray(p.condition)) {
      return p.condition as never[];
    }
    // Fresh fetch: always force `public: true` and default to the
    // displayOrder ordering the deployed API uses.
    return loadRelation(p, 'condition', {
      parentModel: 'conditionGroup',
      parentWhere: { id: p.id },
      prismaRelationName: 'condition',
      args: {
        ...(args ?? {}),
        where: { ...(args?.where ?? {}), public: true },
        orderBy: args?.orderBy ?? { displayOrder: 'asc' },
      },
    });
  },
};
