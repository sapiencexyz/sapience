/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `account(address:)` / `accounts(...)` — singular + Relay connection
 * over the User table. Synthesis lives at the single-lookup level only;
 * the plural connection returns persisted rows.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { synthesizeAccount } from '../../../sdl/resolvers/accountSynthesis';
import {
  buildConnection,
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
} from '../../relay/connection';

export const account = async (
  _parent: unknown,
  { address }: { address: string },
  ctx: any
) => {
  const addressLc = address.toLowerCase();
  const row = ctx?.loaders?.userByAddress
    ? await ctx.loaders.userByAddress.load(addressLc)
    : await prisma.user.findUnique({ where: { address: addressLc } });
  return row ?? synthesizeAccount(addressLc);
};

export const accounts = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: { search?: string | null } | null;
    orderBy?: { field: string; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');
  const search = args.filter?.search?.trim();

  const where: Prisma.UserWhereInput = search
    ? { address: { contains: search.toLowerCase(), mode: 'insensitive' } }
    : {};

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.UserWhereInput>({
        orderField: 'createdAt',
        orderValue: new Date(cursor.k),
        idField: 'id',
        idValue: Number(cursor.id),
        direction,
      })
    : null;

  const [rows, totalCount] = await Promise.all([
    prisma.user.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: first + 1,
    }),
    prisma.user.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row) =>
      encodeCursor({
        k: row.createdAt.toISOString(),
        id: String(row.id),
      }),
  });
};
