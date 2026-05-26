/**
 * `category(id:)` / `categories(...)` — Category lookups.
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
import { CACHE_HINTS, setCacheHint } from '../../cacheHints';

export const category: NonNullable<QueryResolvers['category']> = async (
  _parent,
  { id }
) => prisma.category.findUnique({ where: { id } });

const FIELD_TO_PRISMA: Record<string, 'name' | 'createdAt'> = {
  NAME: 'name',
  CREATED_AT: 'createdAt',
};

export const categories: NonNullable<QueryResolvers['categories']> = async (
  _parent,
  args,
  _ctx,
  info
) => {
  // Categories change rarely (manual admin action). 5min CDN/in-process
  // cache absorbs the dashboard's load page and the navbar.
  setCacheHint(info, CACHE_HINTS.STABLE_FIVE_MINUTES);
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

  const rows = await prisma.category.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.CategoryOrderByWithRelationInput,
      { id: direction },
    ],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.category.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k: field === 'createdAt' ? row.createdAt.toISOString() : row.name,
        id: String(row.id),
      }),
  });
};
