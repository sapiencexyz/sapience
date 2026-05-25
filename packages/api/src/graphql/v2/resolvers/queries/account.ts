/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `account(address:)` / `accounts(...)` — singular + Relay connection
 * over the User table. Synthesis lives at the single-lookup level only;
 * the plural connection returns persisted rows.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { synthesizeAccount } from '../../../sdl/resolvers/accountSynthesis';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

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

/**
 * Stable cursor predicate over `(createdAt, id)`. Both halves are
 * required because `createdAt` alone collides on simultaneous inserts
 * and `id` alone shifts under inserts to lower-ranked rows.
 */
const buildCursorPredicate = (
  k: string,
  cursorId: string,
  direction: 'asc' | 'desc'
): Prisma.UserWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const createdAt = new Date(k);
  const id = Number(cursorId);
  return {
    OR: [
      { createdAt: { [op]: createdAt } },
      {
        AND: [{ createdAt: { equals: createdAt } }, { id: { [op]: id } }],
      },
    ],
  } as Prisma.UserWhereInput;
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
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const search = args.filter?.search?.trim();
  const baseWhere: Prisma.UserWhereInput = search
    ? { address: { contains: search.toLowerCase(), mode: 'insensitive' } }
    : {};
  const cursorPayload = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursorPayload
    ? buildCursorPredicate(cursorPayload.k, cursorPayload.id, direction)
    : null;
  const where: Prisma.UserWhereInput = cursorWhere
    ? { AND: [baseWhere, cursorWhere] }
    : baseWhere;

  const [rows, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: first + 1,
    }),
    prisma.user.count({ where: baseWhere }),
  ]);

  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const edges = pageRows.map((row) => ({
    node: row,
    cursor: encodeCursor({
      k: row.createdAt.toISOString(),
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
