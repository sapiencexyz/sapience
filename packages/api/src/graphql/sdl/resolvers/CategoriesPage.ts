/**
 * CategoriesPage field resolvers — lazy `totalCount`.
 *
 * No filter args on `categoriesPage`, so the count is always over the
 * full Category table.
 */

import type { CategoriesPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type CategoriesPageParent = {
  totalCount?: number | null;
};

export const CategoriesPage: CategoriesPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as CategoriesPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    return prisma.category.count();
  },
};
