import { initializeDataSource } from '../db';
import { initializeMarket, reindexMarketEvents } from '../controllers/market';
import * as Sentry from '@sentry/node';
import { marketRepository } from '../db';
import { INDEXERS } from '../fixtures';
import { Abi } from 'viem';
import Foil from '@foil/protocol/deployments/Foil.json';

export async function reindexMarket(
  chainId: number,
  address: string,
  epochId: string
) {
  try {
    console.log(
      'reindexing market',
      address,
      'on chain',
      chainId,
      'epoch',
      epochId
    );

    await initializeDataSource();
    
    // Find the market in the database instead of using MARKETS
    const marketEntity = await marketRepository.findOne({
      where: {
        chainId,
        address: address.toLowerCase(),
      },
      relations: ['resource'],
    });

    if (!marketEntity) {
      throw new Error(
        `Market not found for chainId ${chainId} and address ${address}`
      );
    }

    // Create a market info object that matches the MarketInfo interface
    const marketInfo = {
      marketChainId: chainId,
      deployment: {
        address,
        abi: Foil.abi as Abi,
        deployTimestamp: marketEntity.deployTimestamp?.toString() || '0',
        deployTxnBlockNumber: marketEntity.deployTxnBlockNumber?.toString() || '0',
      },
      vaultAddress: marketEntity.vaultAddress || '',
      isYin: marketEntity.isYin || false,
      isCumulative: marketEntity.isCumulative || false,
      resource: {
        name: marketEntity.resource.name,
        priceIndexer: INDEXERS[marketEntity.resource.slug]
      }
    };

    const market = await initializeMarket(marketInfo);

    await Promise.all([
      // Pass only the two required arguments: market and epochId
      reindexMarketEvents(market, Number(epochId)),
    ]);

    console.log('finished reindexing market', address, 'on chain', chainId);
  } catch (error) {
    console.error('Error in reindexMarket:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('address', address);
      scope.setExtra('epochId', epochId);
      Sentry.captureException(error);
    });
    throw error;
  }
}
