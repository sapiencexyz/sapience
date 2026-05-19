/**
 * Secondary-trade queries: `trades`, `trade`, `tradeCount`.
 *
 * All three filter on the same set of dimensions (seller/buyer/token/
 * chainId). `trades` additionally accepts `address`, which is a
 * shorthand for `seller = X OR buyer = X` — the two are mutually
 * exclusive with the explicit seller/buyer filters.
 *
 * Addresses and tokens are normalized to lowercase at the edge since
 * the indexer stores them lowercase.
 */

import type {
  QueryResolvers,
  QueryTradesArgs,
  QueryTradesConnectionArgs,
} from '../../__generated__/resolvers';
import { OrderDirection, TradeOrderField } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';

type Trade = NonNullable<
  Awaited<ReturnType<typeof prisma.secondaryTrade.findUnique>>
>;

const mapTrade = (r: Trade) => ({
  id: r.id,
  chainId: r.chainId,
  tradeHash: r.tradeHash,
  seller: r.seller,
  buyer: r.buyer,
  token: r.token,
  collateral: r.collateral,
  tokenAmount: r.tokenAmount,
  price: r.price,
  refCode: r.refCode ?? null,
  executedAt: r.executedAt,
  txHash: r.txHash,
  blockNumber: r.blockNumber,
});

export type TradesPageEnvelope = {
  items: ReturnType<typeof mapTrade>[];
  hasMore: boolean;
  _countWhere?: Prisma.SecondaryTradeWhereInput;
};

/**
 * Extended args accepted by `runTrades` — superset of the deprecated bare
 * `trades(...)` args. The new filter fields (`executedAtMin`/`Max`) and
 * sort args (`orderBy`/`orderDirection`) live only on `tradesPage` /
 * `TradeFilters`; passing them through here keeps a single canonical
 * pipeline for both surfaces.
 */
export type RunTradesArgs = QueryTradesArgs & {
  executedAtMin?: number | null;
  executedAtMax?: number | null;
  orderBy?: 'EXECUTED_AT' | 'BLOCK_NUMBER' | null;
  orderDirection?: 'asc' | 'desc' | null;
};

export const runTrades = async ({
  take,
  skip,
  address,
  seller,
  buyer,
  token,
  chainId,
  executedAtMin,
  executedAtMax,
  orderBy,
  orderDirection,
}: RunTradesArgs): Promise<TradesPageEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 50, maxTake: 100 });
  const skipVal = clampSkip(skip);
  const where: Prisma.SecondaryTradeWhereInput = {};
  if (address && (seller || buyer)) {
    throw new Error(
      'Cannot combine "address" with "seller" or "buyer" filters'
    );
  }
  if (address) {
    const addr = address.toLowerCase();
    where.OR = [{ seller: addr }, { buyer: addr }];
  } else {
    if (seller) where.seller = seller.toLowerCase();
    if (buyer) where.buyer = buyer.toLowerCase();
  }
  if (token) where.token = token.toLowerCase();
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (executedAtMin != null || executedAtMax != null) {
    const range: Prisma.IntFilter = {};
    if (executedAtMin != null) range.gte = executedAtMin;
    if (executedAtMax != null) range.lte = executedAtMax;
    where.executedAt = range;
  }

  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderByClause: Prisma.SecondaryTradeOrderByWithRelationInput =
    orderBy === 'BLOCK_NUMBER'
      ? { blockNumber: direction }
      : { executedAt: direction };

  const rawRows = await prisma.secondaryTrade.findMany({
    where,
    orderBy: orderByClause,
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  const rows = rawRows.slice(0, cappedTake);
  return { items: rows.map(mapTrade), hasMore, _countWhere: where };
};

/**
 * Merge `filters: TradeFilters` with the deprecated flat arg shape.
 * `filters` wins on conflicts. The `address` vs `seller`/`buyer`
 * mutual-exclusion check happens downstream in `runTrades`. New
 * filter fields (`executedAtMin`/`Max`) live only on `TradeFilters`.
 */
const mergeTradeFilters = (args: QueryTradesConnectionArgs): RunTradesArgs => {
  const f = args.filter ?? null;
  return {
    take: args.first ?? 50,
    skip: offsetFromCursor(args.after),
    address: f?.address ?? null,
    seller: f?.seller ?? null,
    buyer: f?.buyer ?? null,
    token: f?.token ?? null,
    chainId: f?.chainId ?? null,
    executedAtMin: f?.executedAtMin ?? null,
    executedAtMax: f?.executedAtMax ?? null,
    orderBy:
      args.orderBy?.field === TradeOrderField.BlockNumber
        ? 'BLOCK_NUMBER'
        : 'EXECUTED_AT',
    orderDirection:
      args.orderBy?.direction === OrderDirection.Asc ? 'asc' : 'desc',
  };
};

const offsetFromCursor = (cursor: string | null | undefined): number => {
  const payload = cursor ? decodeCursor(cursor) : null;
  const offset = payload ? Number(payload.k) : Number.NaN;
  return Number.isInteger(offset) && offset >= 0 ? offset + 1 : 0;
};

export const tradesConnection: NonNullable<
  QueryResolvers['tradesConnection']
> = async (_parent, args) => {
  const result = await runTrades(mergeTradeFilters(args));
  const startOffset = offsetFromCursor(args.after);
  const edges = result.items.map((node, index) => ({
    node,
    cursor: encodeCursor({
      k: String(startOffset + index),
      id: String(node.id),
    }),
  }));
  return {
    edges,
    nodes: result.items,
    pageInfo: {
      hasNextPage: result.hasMore,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};

export const trade: NonNullable<QueryResolvers['trade']> = async (
  _parent,
  { tradeHash, id }
) => {
  const key = tradeHash ?? id;
  if (!key) {
    throw new Error('trade: pass `tradeHash` (or the deprecated `id`)');
  }
  const r = await prisma.secondaryTrade.findUnique({
    where: { tradeHash: key.toLowerCase() },
  });
  return r ? mapTrade(r) : null;
};

export const tradeByHash: NonNullable<QueryResolvers['tradeByHash']> = async (
  _parent,
  { hash }
) => {
  const r = await prisma.secondaryTrade.findUnique({
    where: { tradeHash: hash.toLowerCase() },
  });
  return r ? mapTrade(r) : null;
};
