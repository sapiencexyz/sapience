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
  QueryTradesPageArgs,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

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

export const runTrades = async ({
  take,
  skip,
  address,
  seller,
  buyer,
  token,
  chainId,
}: QueryTradesArgs): Promise<TradesPageEnvelope> => {
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
  const rawRows = await prisma.secondaryTrade.findMany({
    where,
    orderBy: { executedAt: 'desc' },
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
 * mutual-exclusion check happens downstream in `runTrades`.
 */
const mergeTradeFilters = (args: QueryTradesPageArgs): QueryTradesArgs => {
  const f = args.filters ?? null;
  return {
    take: args.take,
    skip: args.skip,
    address: f?.address ?? args.address ?? null,
    seller: f?.seller ?? args.seller ?? null,
    buyer: f?.buyer ?? args.buyer ?? null,
    token: f?.token ?? args.token ?? null,
    chainId: f?.chainId ?? args.chainId ?? null,
  };
};

export const tradesPage: NonNullable<QueryResolvers['tradesPage']> = async (
  _parent,
  args
) => {
  return runTrades(mergeTradeFilters(args));
};

export const trade: NonNullable<QueryResolvers['trade']> = async (
  _parent,
  { id }
) => {
  const r = await prisma.secondaryTrade.findUnique({
    where: { tradeHash: id.toLowerCase() },
  });
  return r ? mapTrade(r) : null;
};
