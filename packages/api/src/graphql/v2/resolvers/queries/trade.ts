/**
 * `trade(tradeHash:)` / `trades(...)` — secondary-market trade queries.
 *
 * Cursor key is `(executedAt | blockNumber, tradeHash)`. tradeHash is
 * unique so the tie-break is canonical.
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

export const trade: NonNullable<QueryResolvers['trade']> = async (
  _parent,
  { tradeHash }
) =>
  prisma.secondaryTrade.findUnique({
    where: { tradeHash: tradeHash.toLowerCase() },
  });

const FIELD_TO_PRISMA: Record<string, 'executedAt' | 'blockNumber'> = {
  EXECUTED_AT: 'executedAt',
  BLOCK_NUMBER: 'blockNumber',
};

export const trades: NonNullable<QueryResolvers['trades']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
  const field = FIELD_TO_PRISMA[args.orderBy?.field ?? 'EXECUTED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');
  type Row = Awaited<ReturnType<typeof prisma.secondaryTrade.findUnique>>;

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

  const rows = await prisma.secondaryTrade.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy: [
      { [field]: direction } as Prisma.SecondaryTradeOrderByWithRelationInput,
      { tradeHash: direction },
    ],
    take: first + 1,
  });

  return buildConnection({
    rows,
    first,
    totalCount: () => prisma.secondaryTrade.count({ where }),
    getCursor: (row) =>
      encodeCursor({
        k: String((row as NonNullable<Row>)[field]),
        id: row.tradeHash,
      }),
  });
};
