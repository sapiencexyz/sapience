/**
 * v2 ConditionGroup — Node-implementing entity. Aggregated counters
 * collapse under `totals: ConditionGroupTotals` to keep the top-level
 * shape tight.
 */

import type { Prisma } from '../../../../generated/prisma';
import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { ConditionGroupResolvers } from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  encodeCursor,
  offsetFromCursor,
} from '../relay/connection';

type ConditionRow = Prisma.ConditionGetPayload<true>;

registerNodeTypeV2({
  type: 'ConditionGroup',
  // `name` is no longer unique (identity moved to (source, externalEventId)),
  // so the global id encodes the numeric DB id — the `groupId` domain id per
  // PLAN.md. Decode defensively: a non-numeric payload resolves to null.
  loader: async (id) => {
    const groupId = Number(id);
    return Number.isInteger(groupId)
      ? prisma.conditionGroup.findUnique({ where: { id: groupId } })
      : null;
  },
});

export const ConditionGroup: ConditionGroupResolvers = {
  id: (parent) => toGlobalIdV2('ConditionGroup', String(parent.id)),

  category: async (parent, _args, ctx) => {
    if (parent.categoryId == null) return null;
    if (ctx.loaders?.categoryById)
      return ctx.loaders.categoryById.load(parent.categoryId);
    return prisma.category.findUnique({ where: { id: parent.categoryId } });
  },

  totals: (parent) => ({
    publicConditionCount: parent.publicConditionCount ?? 0,
    totalPredictionCount: parent.totalPredictionCount ?? 0,
    totalOpenInterest: BigInt(parent.totalOpenInterest?.toString() ?? '0'),
    maxEndTime: parent.maxEndTime ?? null,
    maxCreatedAt:
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
    // Guard against a foreign/garbage `k`: offsetFromCursor resets to 0
    // rather than NaN (which would slice to an empty page and emit "NaN").
    const skip = offsetFromCursor(args.after);

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
