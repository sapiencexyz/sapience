import { initializeDataSource } from '../db';
import { MARKETS } from '../fixtures';
import { initializeMarket, reindexMarketEvents } from '../controllers/market';
import * as Sentry from '@sentry/node';

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
    const marketInfo = MARKETS.find(
      (m: { marketChainId: number; deployment: { address: string } }) =>
        m.marketChainId === chainId &&
        m.deployment.address.toLowerCase() === address.toLowerCase()
    );
    if (!marketInfo) {
      throw new Error(
        `Market not found for chainId ${chainId} and address ${address}`
      );
    }
    const market = await initializeMarket(marketInfo);

    await Promise.all([
      reindexMarketEvents(market, marketInfo.deployment.abi, Number(epochId)),
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
