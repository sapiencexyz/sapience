/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `category(id:)` / `categories(...)` — Category lookups.
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

export const category = async (_parent: unknown, { id }: { id: number }) =>
  prisma.category.findUnique({ where: { id } });

type Field = 'NAME' | 'CREATED_AT';
const FIELD_TO_PRISMA: Record<Field, 'name' | 'createdAt'> = {
  NAME: 'name',
  CREATED_AT: 'createdAt',
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
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');
  const search = args.filter?.search?.trim();

  const where: Prisma.CategoryWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.CategoryWhereInput>({
        orderField: field,
        orderValue: field === 'createdAt' ? new Date(cursor.k) : cursor.k,
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const [rows, totalCount] = await Promise.all([
    prisma.category.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { id: direction }],
      take: first + 1,
    }),
    prisma.category.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row) =>
      encodeCursor({
        k: field === 'createdAt' ? row.createdAt.toISOString() : row.name,
        id: String(row.id),
      }),
  });
};
