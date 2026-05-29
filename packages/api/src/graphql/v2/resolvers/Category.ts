/**
 * v2 Category — Node-implementing record from the Postgres `Category`
 * table. The opaque `id: ID!` is the globalId; clients reference a
 * category by `slug` for human-readable lookups.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { CategoryResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Category',
  loader: async (id) => prisma.category.findUnique({ where: { slug: id } }),
});

export const Category: CategoryResolvers = {
  id: (parent) => toGlobalIdV2('Category', parent.slug),
};
