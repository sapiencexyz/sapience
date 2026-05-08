/**
 * PositionsPage field resolvers.
 *
 * `totalCount` is lazy: `runPositions` returns the matching where
 * clause as `_countWhere` rather than running an eager count, so the
 * `prisma.position.count(...)` query only fires when the client
 * actually selects `totalCount`. The deprecated bare-array `positions`
 * wrapper discards the envelope's totalCount and never reaches this
 * resolver, so it gets the count-skip for free.
 *
 * The count is the number of underlying Position rows matching the
 * filters (not the count of rendered event-stream rows, which can be
 * larger after per-sell synthetic expansion).
 */

import type { PositionsPageResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';

type PositionsPageParent = {
  totalCount?: number | null;
  _countWhere?: Parameters<typeof prisma.position.count>[0]['where'];
};

export const PositionsPage: PositionsPageResolvers = {
  totalCount: async (parent: unknown) => {
    const p = parent as PositionsPageParent;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return prisma.position.count({ where: p._countWhere });
  },
};
