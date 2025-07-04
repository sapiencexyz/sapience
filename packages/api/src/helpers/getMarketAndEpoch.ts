import prisma from '../db';
import type { Prisma } from '../../generated/prisma';

export const getMarketAndEpoch = async (
  marketAddress: string,
  marketId: number,
  chainId: number
): Promise<{
  market: Prisma.marketGetPayload<{ include: { market_group: true } }>;
  marketGroup: Prisma.market_groupGetPayload<object>;
} | null> => {
  const market = await prisma.market.findFirst({
    where: {
      marketId,
      market_group: {
        address: marketAddress.toLowerCase(),
        chainId,
      },
    },
    include: {
      market_group: true,
    },
  });

  if (!market || !market.market_group) {
    return null;
  }

  return {
    market,
    marketGroup: market.market_group,
  };
};

export const getMarketGroupAndMarket = async (
  chainId: number,
  marketAddress: string,
  epochId: number
): Promise<{
  market: Prisma.marketGetPayload<{ include: { market_group: true } }>;
  marketGroup: Prisma.market_groupGetPayload<object>;
} | null> => {
  const market = await prisma.market.findFirst({
    where: {
      marketId: epochId,
      market_group: {
        address: marketAddress.toLowerCase(),
        chainId,
      },
    },
    include: {
      market_group: true,
    },
  });

  if (!market || !market.market_group) {
    return null;
  }

  return {
    market,
    marketGroup: market.market_group,
  };
};
