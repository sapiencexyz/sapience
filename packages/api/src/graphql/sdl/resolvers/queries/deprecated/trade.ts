/**
 * Deprecated secondary-trade queries:
 *
 *   - trades — replaced by `tradesPage`. Logic lives in `runTrades`.
 *   - tradeCount — unused; will be removed.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { Prisma } from '../../../../../../generated/prisma';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import prisma from '../../../../../core/db';
import { runTrades } from '../trade';

export const trades: NonNullable<QueryResolvers['trades']> = async (
  _parent,
  args
) => {
  logDeprecatedHit('trades');
  const { items } = await runTrades(args);
  return items;
};

export const tradeCount: NonNullable<QueryResolvers['tradeCount']> = async (
  _parent,
  { seller, buyer, token, chainId }
) => {
  logDeprecatedHit('tradeCount');
  const where: Prisma.SecondaryTradeWhereInput = {};
  if (seller) where.seller = seller.toLowerCase();
  if (buyer) where.buyer = buyer.toLowerCase();
  if (token) where.token = token.toLowerCase();
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.secondaryTrade.count({ where });
};
