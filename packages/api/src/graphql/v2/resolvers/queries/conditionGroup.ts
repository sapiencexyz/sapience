/**
 * `conditionGroup(id:)` / `conditionGroups(...)` — Relay queries over
 * the `ConditionGroup` table. `TOTAL_OPEN_INTEREST` /
 * `TOTAL_PREDICTION_COUNT` are Decimal columns that don't keyset-cast
 * cleanly, so those orderBy modes fall back to offset paging.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  offsetFromCursor,
  timestampCursorArgs,
  withCursorWhere,
} from '../../relay/connection';
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { id }) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'ConditionGroup') return null;
  const groupId = Number(parts.id);
  if (!Number.isInteger(groupId)) return null;
  return prisma.conditionGroup.findUnique({ where: { id: groupId } });
};

const FIELD_TO_PRISMA: Record<string, string> = {
  CREATED_AT: 'createdAt',
  NAME: 'name',
  MAX_END_TIME: 'maxEndTime',
  TOTAL_OPEN_INTEREST: 'totalOpenInterest',
  TOTAL_PREDICTION_COUNT: 'totalPredictionCount',
};

export const conditionGroups: NonNullable<
  QueryResolvers['conditionGroups']
> = async (_parent, args) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'MAX_END_TIME'];
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');

  const where: Prisma.ConditionGroupWhereInput = {};
  if (args.filter?.categorySlug)
    where.category = { is: { slug: args.filter.categorySlug } };
  if (args.filter?.search?.trim()) {
    where.name = { contains: args.filter.search.trim(), mode: 'insensitive' };
  }
  // Batch-by-id lookup (markets-by-id hydration): `groupId` is the group's
  // numeric domain id, which is the `ConditionGroup` table primary key.
  if (args.filter?.groupIds?.length) {
    where.id = { in: args.filter.groupIds };
  }

  const usesOffset =
    field === 'totalOpenInterest' || field === 'totalPredictionCount';
  const isCreatedAt = field === 'createdAt';
  const cursor = args.after ? decodeCursor(args.after) : null;
  // Guard the offset against a foreign/garbage `k`: offsetFromCursor resets
  // to 0 rather than NaN (which would stick paging and emit "NaN" cursors).
  const skip = usesOffset ? offsetFromCursor(args.after) : 0;
  // createdAt is Timestamp(6); a JS-Date keyset loses microseconds, so page it
  // via Prisma's native id cursor. name / maxEndTime keep the value keyset.
  const cursorWhere =
    cursor && !usesOffset && !isCreatedAt
      ? buildKeysetWhere<Prisma.ConditionGroupWhereInput>({
          orderField: field,
          orderValue: field === 'name' ? cursor.k : Number(cursor.k),
          idField: 'id',
          idValue: Number(cursor.id),
          direction,
        })
      : null;

  const rows = await prisma.conditionGroup.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.ConditionGroupOrderByWithRelationInput,
      { id: direction },
    ],
    take: first + 1,
    ...(isCreatedAt
      ? timestampCursorArgs(args.after, Number)
      : { skip: skip || undefined }),
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.conditionGroup.count({ where }),
    getCursor: (row, idx) => {
      const k = usesOffset
        ? String(skip + idx)
        : field === 'createdAt'
          ? row.createdAt.toISOString()
          : String(row[field as keyof typeof row]);
      return encodeCursor({ k, id: String(row.id) });
    },
  });
};
