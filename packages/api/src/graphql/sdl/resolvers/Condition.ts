/**
 * Condition model resolvers.
 *
 * GraphQL field names match Prisma relation names for Condition —
 * `category`, `conditionGroup`, `attestations`, `predictions` — so no
 * rename bookkeeping. Scalar fields pass through the default field
 * resolver.
 */

import type { ConditionResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaCondition = { id: string; [k: string]: unknown };

export const Condition: ConditionResolvers = {
  category: async (parent, args) =>
    loadRelation(parent as PrismaCondition, 'category', {
      parentModel: 'condition',
      parentWhere: { id: (parent as PrismaCondition).id },
      prismaRelationName: 'category',
      args,
    }),

  conditionGroup: async (parent, args) =>
    loadRelation(parent as PrismaCondition, 'conditionGroup', {
      parentModel: 'condition',
      parentWhere: { id: (parent as PrismaCondition).id },
      prismaRelationName: 'conditionGroup',
      args,
    }),

  attestations: async (parent, args) =>
    loadRelation(parent as PrismaCondition, 'attestations', {
      parentModel: 'condition',
      parentWhere: { id: (parent as PrismaCondition).id },
      prismaRelationName: 'attestations',
      args,
    }),

  predictions: async (parent, args) =>
    loadRelation(parent as PrismaCondition, 'predictions', {
      parentModel: 'condition',
      parentWhere: { id: (parent as PrismaCondition).id },
      prismaRelationName: 'predictions',
      args,
    }),
};
