/**
 * Category model resolvers — maps the GraphQL Category type onto its
 * Prisma row.
 *
 * Scalar fields (`id`, `name`, `slug`, `createdAt`) fall through to the
 * default field resolver since the Prisma row exposes them directly.
 * The two list relations have name mismatches the SDL papers over:
 * GraphQL `conditions`/`conditionGroups` map to Prisma `condition`/
 * `condition_group`.
 */

import type { CategoryResolvers } from '../__generated__/resolvers';
import { toGlobalId } from '../../relay/globalId';
import { loadRelation } from './relationHelpers';

type PrismaCategory = { id: number; [k: string]: unknown };

export const Category: CategoryResolvers = {
  id: (parent) => toGlobalId('Category', (parent as PrismaCategory).id),

  conditions: async (parent, args) =>
    loadRelation(parent as PrismaCategory, 'condition', {
      parentModel: 'category',
      parentWhere: { id: (parent as PrismaCategory).id },
      prismaRelationName: 'condition',
      args,
    }),

  conditionGroups: async (parent, args) =>
    loadRelation(parent as PrismaCategory, 'condition_group', {
      parentModel: 'category',
      parentWhere: { id: (parent as PrismaCategory).id },
      prismaRelationName: 'condition_group',
      args,
    }),
};
