/**
 * `account(address:)` / `accounts(...)` — singular + Relay connection
 * over the User table. Synthesis lives at the single-lookup level only;
 * the plural connection returns persisted rows.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { synthesizeAccount } from '../../../sdl/resolvers/accountSynthesis';
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

export const account: NonNullable<QueryResolvers['account']> = async (
  _parent,
  { address },
  ctx
) => {
  const addressLc = address.toLowerCase();
  const row = ctx.loaders?.userByAddress
    ? await ctx.loaders.userByAddress.load(addressLc)
    : await prisma.user.findUnique({ where: { address: addressLc } });
  // synthesizeAccount returns a v1-typed Account; the runtime shape matches
  // the Prisma row mapper used here, so the cast is purely a name-level fix.
  // Schema declares this as non-null (`account(...): Account!`) — the
  // synthesis path guarantees a value, never returns null.
  return (row ?? synthesizeAccount(addressLc)) as NonNullable<
    Awaited<ReturnType<typeof prisma.user.findUnique>>
  >;
};

export const accounts: NonNullable<QueryResolvers['accounts']> = async (
  _parent,
  args
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
