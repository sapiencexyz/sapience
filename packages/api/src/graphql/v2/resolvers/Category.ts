/**
 * v2 Category — Node-implementing record from the Postgres `Category`
 * table. Exposes its row id as the named `categoryId` field; the
 * opaque `id: ID!` is the globalId.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { CategoryResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Category',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.category.findUnique({ where: { id: rowId } });
  },
});

export const Category: CategoryResolvers = {
  id: (parent) => toGlobalIdV2('Category', String(parent.id)),
  categoryId: (parent) => parent.id,
};
