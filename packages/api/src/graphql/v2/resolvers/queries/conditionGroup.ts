/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `conditionGroup(id:)` / `conditionGroups(...)` — Relay queries over
 * the `ConditionGroup` table.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

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
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'MAX_END_TIME'];
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';

  const where: Prisma.ConditionGroupWhereInput = {};
  if (args.filter?.categoryId != null)
    where.categoryId = args.filter.categoryId;
  if (args.filter?.search?.trim()) {
    where.name = { contains: args.filter.search.trim(), mode: 'insensitive' };
  }

  // Decimal/numeric fields are stored as Decimal — keyset cursor over
  // them needs a stringified comparison; default to offset for those.
  const isDecimalField =
    field === 'totalOpenInterest' || field === 'totalPredictionCount';

  const after = args.after ? decodeCursor(args.after) : null;
  let pageWhere: Prisma.ConditionGroupWhereInput = where;
  let skip = 0;

  if (after) {
    if (isDecimalField) {
      skip = Number(after.k) + 1;
    } else {
      const op = direction === 'desc' ? 'lt' : 'gt';
      const keyValue =
        field === 'createdAt'
          ? new Date(after.k)
          : field === 'name'
            ? after.k
            : Number(after.k);
      const cursorWhere: Prisma.ConditionGroupWhereInput = {
        OR: [
          { [field]: { [op]: keyValue } } as Prisma.ConditionGroupWhereInput,
          {
            AND: [
              {
                [field]: { equals: keyValue },
              } as Prisma.ConditionGroupWhereInput,
              { id: { [op]: Number(after.id) } },
            ],
          },
        ],
      };
      pageWhere = { AND: [where, cursorWhere] };
    }
  }

  const [rows, totalCount] = await Promise.all([
    prisma.conditionGroup.findMany({
      where: pageWhere,
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
      skip: skip || undefined,
    }),
    prisma.conditionGroup.count({ where }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row, idx) => ({
    node: row,
    cursor: encodeCursor({
      k: isDecimalField
        ? String(skip + idx)
        : field === 'createdAt'
          ? (row as any).createdAt.toISOString()
          : String((row as any)[field]),
      id: String(row.id),
    }),
  }));

  return {
    edges,
    nodes: pageRows,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
