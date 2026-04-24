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

import type { QueryResolvers } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../db';

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

export const trades: NonNullable<QueryResolvers['trades']> = async (
  _parent,
  { take, skip, address, seller, buyer, token, chainId }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
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
  const rows = await prisma.secondaryTrade.findMany({
    where,
    orderBy: { executedAt: 'desc' },
    take: cappedTake,
    skip,
  });
  return rows.map(mapTrade);
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

export const tradeCount: NonNullable<QueryResolvers['tradeCount']> = async (
  _parent,
  { seller, buyer, token, chainId }
) => {
  const where: Prisma.SecondaryTradeWhereInput = {};
  if (seller) where.seller = seller.toLowerCase();
  if (buyer) where.buyer = buyer.toLowerCase();
  if (token) where.token = token.toLowerCase();
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.secondaryTrade.count({ where });
};
