/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 ConditionGroup — Node-implementing entity. The row's integer pk
 * surfaces as `groupId`; aggregated counters collapse under
 * `totals: ConditionGroupTotals` to keep the top-level shape tight.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import { decodeCursor, encodeCursor } from '../../relay/cursor';
import { clampTake } from '../../sdl/resolvers/queries/pagination';

registerNodeTypeV2({
  type: 'ConditionGroup',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.conditionGroup.findUnique({ where: { id: rowId } });
  },
});

export const ConditionGroup = {
  id: (parent: any) => toGlobalIdV2('ConditionGroup', String(parent.id)),
  groupId: (parent: any) => parent.id,

  category: async (parent: any) => {
    if (parent.categoryId == null) return null;
    return prisma.category.findUnique({ where: { id: parent.categoryId } });
  },

  totals: (parent: any) => ({
    publicConditionCount: parent.publicConditionCount ?? 0,
    totalPredictionCount: parent.totalPredictionCount ?? 0,
    totalOpenInterest: parent.totalOpenInterest?.toString() ?? '0',
    maxEndTime: parent.maxEndTime || null,
    maxCreatedAtEpoch:
      parent.maxCreatedAtEpoch != null
        ? Number(parent.maxCreatedAtEpoch)
        : null,
    totalSimilarMarketVolume1h: Number(parent.totalSimilarMarketVolume1h ?? 0),
    totalSimilarMarketVolume4h: Number(parent.totalSimilarMarketVolume4h ?? 0),
    totalSimilarMarketVolume24h: Number(
      parent.totalSimilarMarketVolume24h ?? 0
    ),
    totalSimilarMarketVolume7d: Number(parent.totalSimilarMarketVolume7d ?? 0),
    totalSimilarMarketVolumeFiltered1h: Number(
      parent.totalSimilarMarketVolumeFiltered1h ?? 0
    ),
    totalSimilarMarketVolumeFiltered4h: Number(
      parent.totalSimilarMarketVolumeFiltered4h ?? 0
    ),
    totalSimilarMarketVolumeFiltered24h: Number(
      parent.totalSimilarMarketVolumeFiltered24h ?? 0
    ),
    totalSimilarMarketVolumeFiltered7d: Number(
      parent.totalSimilarMarketVolumeFiltered7d ?? 0
    ),
  }),

  conditions: async (
    parent: any,
    args: { first?: number | null; after?: string | null }
  ) => {
    const first = clampTake(args.first ?? 50, {
      defaultTake: 50,
      maxTake: 100,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const skip = after ? Number(after.k) + 1 : 0;

    // Conditions within a group order by displayOrder (nulls last) then
    // createdAt asc. The set is bounded (per-group), so offset paging
    // is fine even for large groups.
    const [rows, totalCount] = await Promise.all([
      prisma.condition.findMany({
        where: { conditionGroupId: parent.id },
        orderBy: [
          { displayOrder: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        skip,
        take: first + 1,
      }),
      prisma.condition.count({ where: { conditionGroupId: parent.id } }),
    ]);

    const hasNextPage = rows.length > first;
    const pageRows = hasNextPage ? rows.slice(0, first) : rows;
    const edges = pageRows.map((row, idx) => ({
      node: row,
      cursor: encodeCursor({ k: String(skip + idx), id: row.id }),
    }));

    return {
      edges,
      nodes: pageRows,
      totalCount,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: skip > 0,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
    };
  },
};

// Backreference: Condition.conditionGroup
export const ConditionGroupBackref = async (parent: {
  conditionGroupId?: number | null;
}) => {
  if (parent.conditionGroupId == null) return null;
  return prisma.conditionGroup.findUnique({
    where: { id: parent.conditionGroupId },
  });
};
