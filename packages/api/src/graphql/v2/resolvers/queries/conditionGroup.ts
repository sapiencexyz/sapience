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
  withCursorWhere,
} from '../../relay/connection';

export const conditionGroup: NonNullable<
  QueryResolvers['conditionGroup']
> = async (_parent, { id }) =>
  prisma.conditionGroup.findUnique({ where: { id } });

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
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'MAX_END_TIME'];
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');

  const where: Prisma.ConditionGroupWhereInput = {};
  if (args.filter?.categoryId != null)
    where.categoryId = args.filter.categoryId;
  if (args.filter?.search?.trim()) {
    where.name = { contains: args.filter.search.trim(), mode: 'insensitive' };
  }

  const usesOffset =
    field === 'totalOpenInterest' || field === 'totalPredictionCount';
  const cursor = args.after ? decodeCursor(args.after) : null;
  const skip = cursor && usesOffset ? Number(cursor.k) + 1 : 0;
  const cursorWhere =
    cursor && !usesOffset
      ? buildKeysetWhere<Prisma.ConditionGroupWhereInput>({
          orderField: field,
          orderValue:
            field === 'createdAt'
              ? new Date(cursor.k)
              : field === 'name'
                ? cursor.k
                : Number(cursor.k),
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
    skip: skip || undefined,
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
