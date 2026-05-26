/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `conditionGroup(id:)` / `conditionGroups(...)` — Relay queries over
 * the `ConditionGroup` table. `TOTAL_OPEN_INTEREST` /
 * `TOTAL_PREDICTION_COUNT` are Decimal columns that don't keyset-cast
 * cleanly, so those orderBy modes fall back to offset paging.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
} from '../../relay/connection';

export const conditionGroup = async (
  _parent: unknown,
  { id }: { id: number }
) => prisma.conditionGroup.findUnique({ where: { id } });

type Field =
  | 'CREATED_AT'
  | 'NAME'
  | 'MAX_END_TIME'
  | 'TOTAL_OPEN_INTEREST'
  | 'TOTAL_PREDICTION_COUNT';
const FIELD_TO_PRISMA: Record<Field, string> = {
  CREATED_AT: 'createdAt',
  NAME: 'name',
  MAX_END_TIME: 'maxEndTime',
  TOTAL_OPEN_INTEREST: 'totalOpenInterest',
  TOTAL_PREDICTION_COUNT: 'totalPredictionCount',
};

export const conditionGroups = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      categoryId?: number | null;
      search?: string | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
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

  const [rows, totalCount] = await Promise.all([
    prisma.conditionGroup.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
      skip: skip || undefined,
    }),
    prisma.conditionGroup.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row, idx) =>
      encodeCursor({
        k: usesOffset
          ? String(skip + idx)
          : field === 'createdAt'
            ? (row as any).createdAt.toISOString()
            : String((row as any)[field]),
        id: String(row.id),
      }),
  });
};
