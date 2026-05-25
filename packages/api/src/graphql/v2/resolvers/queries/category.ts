/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `category(id:)` / `categories(...)` — Category lookups.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

export const category = async (_parent: unknown, { id }: { id: number }) =>
  prisma.category.findUnique({ where: { id } });

type Field = 'NAME' | 'CREATED_AT';
const FIELD_TO_PRISMA: Record<Field, 'name' | 'createdAt'> = {
  NAME: 'name',
  CREATED_AT: 'createdAt',
};

const buildCursorPredicate = (
  k: string,
  cursorId: string,
  field: 'name' | 'createdAt',
  direction: 'asc' | 'desc'
): Prisma.CategoryWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const keyValue = field === 'createdAt' ? new Date(k) : k;
  const id = Number(cursorId);
  return {
    OR: [
      { [field]: { [op]: keyValue } } as Prisma.CategoryWhereInput,
      {
        AND: [
          { [field]: { equals: keyValue } } as Prisma.CategoryWhereInput,
          { id: { [op]: id } },
        ],
      },
    ],
  };
};

export const categories = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: { search?: string | null } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 100, {
    defaultTake: 100,
    maxTake: 100,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'NAME'];
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const search = args.filter?.search?.trim();
  const baseWhere: Prisma.CategoryWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};
  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursorPayload
    ? buildCursorPredicate(cursorPayload.k, cursorPayload.id, field, direction)
    : null;
  const where = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;

  const [rows, totalCount] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
    }),
    prisma.category.count({ where: baseWhere }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k:
        field === 'createdAt'
          ? row.createdAt.toISOString()
          : (row as { name: string }).name,
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
