import { Repository } from 'typeorm';
import { MarketGroup } from '../models/MarketGroup';
import { Market } from '../models/Market';

export const getMarketGroupAndMarket = async (
  marketGroupRepository: Repository<MarketGroup>,
  marketRepository: Repository<Market>,
  chainId: string,
  address: string,
  marketId: string
): Promise<{ marketGroup: MarketGroup; market: Market }> => {
  const marketGroup = await marketGroupRepository.findOne({
    where: { chainId: Number(chainId), address: address.toLowerCase() },
  });
  if (!marketGroup) {
    throw new Error(
      `MarketGroup not found for chainId ${chainId} and address ${address}`
    );
  }
  const market = await marketRepository.findOne({
    where: { marketGroup: { id: marketGroup.id }, marketId: Number(marketId) },
  });
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address} and marketId ${marketId}`
    );
  }
  return { marketGroup, market };
};
