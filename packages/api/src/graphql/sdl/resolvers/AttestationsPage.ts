/**
 * AttestationsPage field resolvers — lazy `totalCount`.
 */

import type { AttestationsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type AttestationsPageParent = {
  totalCount?: number | null;
  _countWhere?: NonNullable<
    Parameters<typeof prisma.attestation.count>[0]
  >['where'];
};

export const AttestationsPage: AttestationsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as AttestationsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.attestation.count({ where: p._countWhere });
  },
};
