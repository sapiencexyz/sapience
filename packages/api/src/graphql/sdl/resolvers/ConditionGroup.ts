/**
 * ConditionGroup model resolvers.
 *
 * The `conditions` field carries the deployed behaviour that hidden
 * conditions never leak: the parent always filters `public: true` even
 * if the caller didn't pass a `where` clause. Default ordering is
 * `displayOrder ASC` to match the frontend's expectation.
 *
 * GraphQL `conditions` maps to Prisma `condition` (the rename was
 * carried via `@TypeGraphQL.field(name: "conditions")` in
 * schema.prisma on the deployed stack).
 */

import type { ConditionGroupResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaConditionGroup = { id: number; [k: string]: unknown };

export const ConditionGroup: ConditionGroupResolvers = {
  category: async (parent, args) =>
    loadRelation(parent as PrismaConditionGroup, 'category', {
      parentModel: 'conditionGroup',
      parentWhere: { id: (parent as PrismaConditionGroup).id },
      prismaRelationName: 'category',
      args,
    }),

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
