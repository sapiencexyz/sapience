/**
 * v2 ConditionGroup — Node-implementing entity. The row's integer pk
 * surfaces as `groupId`; aggregated counters collapse under
 * `totals: ConditionGroupTotals` to keep the top-level shape tight.
 */

import type { Prisma } from '../../../../generated/prisma';
import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { ConditionGroupResolvers } from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';

type ConditionRow = Prisma.ConditionGetPayload<true>;

registerNodeTypeV2({
  type: 'ConditionGroup',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.conditionGroup.findUnique({ where: { id: rowId } });
  },
});

export const ConditionGroup: ConditionGroupResolvers = {
  id: (parent) => toGlobalIdV2('ConditionGroup', String(parent.id)),
  groupId: (parent) => parent.id,

  category: async (parent) => {
    if (parent.categoryId == null) return null;
    return prisma.category.findUnique({ where: { id: parent.categoryId } });
  },

  totals: (parent) => ({
    publicConditionCount: parent.publicConditionCount ?? 0,
    totalPredictionCount: parent.totalPredictionCount ?? 0,
    totalOpenInterest: BigInt(parent.totalOpenInterest?.toString() ?? '0'),
    maxEndTime: parent.maxEndTime ?? null,
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

  conditions: async (parent, args, ctx) => {
    const first = clampTake(args.first ?? 50, {
      defaultTake: 50,
      maxTake: 100,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const skip = after ? Number(after.k) + 1 : 0;

    // Conditions within a group order by displayOrder (nulls last) then
    // createdAt asc. Per-group sets are bounded; per-request loader
    // amortizes count+page across multiple parent rows in the same
    // selection.
    const all: ConditionRow[] = ctx.loaders?.conditionsByGroupId
      ? ((await ctx.loaders.conditionsByGroupId.load(parent.id)) ?? [])
      : await prisma.condition.findMany({
          where: { conditionGroupId: parent.id },
          orderBy: [
            { displayOrder: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        });

    const totalCount = all.length;
    const rows = all.slice(skip, skip + first + 1);

    return buildConnection({
      rows,
      first,
      totalCount,
      getCursor: (row, idx) =>
        encodeCursor({ k: String(skip + idx), id: row.id }),
    });
  },
};
