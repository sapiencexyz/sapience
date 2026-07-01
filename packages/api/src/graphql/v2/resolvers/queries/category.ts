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
  timestampCursorArgs,
  withCursorWhere,
} from '../../relay/connection';
import { CACHE_HINTS, setCacheHint } from '../../cacheHints';
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const category: NonNullable<QueryResolvers['category']> = async (
  _parent,
  { id }
) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Category') return null;
  return prisma.category.findUnique({ where: { slug: parts.id } });
};

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
  const first = clampTake(args.first ?? 25, {
    defaultTake: 25,
    maxTake: 25,
  });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'NAME'];
  const direction = normalizeDirection(args.orderBy?.direction, 'asc');
  const search = args.filter?.search?.trim();

  const where: Prisma.CategoryWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } }
    : {};

  const isCreatedAt = field === 'createdAt';
  const cursor = args.after ? decodeCursor(args.after) : null;
  // createdAt is Timestamp(6); a JS-Date keyset loses microseconds, so page it
  // via Prisma's native id cursor. The other field (name) keeps the keyset.
  const cursorWhere =
    cursor && !isCreatedAt
      ? buildKeysetWhere<Prisma.CategoryWhereInput>({
          orderField: field,
          orderValue: cursor.k,
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
    ...(isCreatedAt ? timestampCursorArgs(args.after, Number) : {}),
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
