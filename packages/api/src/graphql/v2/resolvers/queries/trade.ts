/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `trade(tradeHash:)` / `trades(...)` — secondary-market trade queries.
 *
 * Cursor key is `(executedAt | blockNumber, tradeHash)`. tradeHash is
 * unique so the tie-break is canonical.
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

export const trade = async (
  _parent: unknown,
  { tradeHash }: { tradeHash: string }
) =>
  prisma.secondaryTrade.findUnique({
    where: { tradeHash: tradeHash.toLowerCase() },
  });

type Field = 'EXECUTED_AT' | 'BLOCK_NUMBER';
const FIELD_TO_PRISMA: Record<Field, 'executedAt' | 'blockNumber'> = {
  EXECUTED_AT: 'executedAt',
  BLOCK_NUMBER: 'blockNumber',
};

export const trades = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      tradeHash?: string | null;
      participant?: string | null;
      buyer?: string | null;
      seller?: string | null;
      token?: string | null;
      tokens?: string[] | null;
      chainId?: number | null;
      executedAt?: { gte?: number | null; lte?: number | null } | null;
    } | null;
    orderBy?: { field: Field; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'EXECUTED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');

  const where: Prisma.SecondaryTradeWhereInput = {};
  if (args.filter?.tradeHash)
    where.tradeHash = args.filter.tradeHash.toLowerCase();
  if (args.filter?.participant) {
    const addr = args.filter.participant.toLowerCase();
    where.OR = [{ buyer: addr }, { seller: addr }];
  } else {
    if (args.filter?.buyer) where.buyer = args.filter.buyer.toLowerCase();
    if (args.filter?.seller) where.seller = args.filter.seller.toLowerCase();
  }
  if (args.filter?.token) where.token = args.filter.token.toLowerCase();
  if (args.filter?.tokens?.length)
    where.token = { in: args.filter.tokens.map((t) => t.toLowerCase()) };
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.executedAt) {
    const r: Prisma.IntFilter = {};
    if (args.filter.executedAt.gte != null) r.gte = args.filter.executedAt.gte;
    if (args.filter.executedAt.lte != null) r.lte = args.filter.executedAt.lte;
    where.executedAt = r;
  }

  const cursor = args.after ? decodeCursor(args.after) : null;
  const cursorWhere = cursor
    ? buildKeysetWhere<Prisma.SecondaryTradeWhereInput>({
        orderField: field,
        orderValue: Number(cursor.k),
        idField: 'tradeHash',
        idValue: cursor.id,
        direction,
      })
    : null;

  const [rows, totalCount] = await Promise.all([
    prisma.secondaryTrade.findMany({
      where: withCursorWhere(where, cursorWhere),
      orderBy: [{ [field]: direction } as any, { tradeHash: direction }],
      take: first + 1,
    }),
    prisma.secondaryTrade.count({ where }),
  ]);

  return buildConnection({
    rows,
    first,
    totalCount,
    getCursor: (row) =>
      encodeCursor({ k: String((row as any)[field]), id: row.tradeHash }),
  });
};
