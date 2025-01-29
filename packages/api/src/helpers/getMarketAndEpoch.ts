import { Repository } from 'typeorm';
import { Market } from '../models/Market';
import { Epoch } from '../models/Epoch';

export const getMarketAndEpoch = async (
  marketRepository: Repository<Market>,
  epochRepository: Repository<Epoch>,
  chainId: string,
  address: string,
  epochId: string
): Promise<{ market: Market; epoch: Epoch }> => {
  const market = await marketRepository.findOne({
    where: { chainId: Number(chainId), address: address },
  });
  if (!market) {
    throw new Error(
      `Market not found for chainId ${chainId} and address ${address}`
    );
  }
  const epoch = await epochRepository.findOne({
    where: { market: { id: market.id }, epochId: Number(epochId) },
  });
  if (!epoch) {
    throw new Error(
      `Epoch not found for chainId ${chainId} and address ${address} and epochId ${epochId}`
    );
  }
  return { market, epoch };
};
