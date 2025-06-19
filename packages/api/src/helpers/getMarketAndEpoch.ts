import prisma from '../db';

export const getMarketGroupAndMarket = async (
  chainId: string,
  address: string,
  marketId: string
): Promise<{ marketGroup: any; market: any }> => {
  const marketGroup = await prisma.market_group.findFirst({
    where: { 
      chainId: Number(chainId), 
      address: address.toLowerCase() 
    },
  });
  if (!marketGroup) {
    throw new Error(
      `MarketGroup not found for chainId ${chainId} and address ${address}`
    );
  }
  const market = await prisma.market.findFirst({
    where: { 
      marketGroupId: marketGroup.id, 
      marketId: Number(marketId) 
    },
  });
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address} and marketId ${marketId}`
    );
  }
  return { marketGroup, market };
};
