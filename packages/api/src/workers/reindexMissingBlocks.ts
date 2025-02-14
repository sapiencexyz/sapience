import { initializeDataSource, resourcePriceRepository } from '../db';
import { MARKETS } from '../fixtures';
import { initializeMarket } from '../controllers/market';
import { getMarketStartEndBlock, getMarketStartEndBlockByTimestamps } from '../controllers/marketHelpers';
import { Between } from 'typeorm';
import * as Sentry from '@sentry/node';

export async function reindexMissingBlocks(
  chainId: number,
  address: string,
  epochId: string,
  startTimestamp?: number,
  endTimestamp?: number,
) {
  try {
    console.log(
      `Starting reindex of missing resource blocks for market ${chainId}:${address}, epoch ${epochId}`
    );
    if (startTimestamp !== undefined  && endTimestamp !== undefined) {
      console.log(
        `Timestamps for reindex specified: ${startTimestamp} to ${endTimestamp}`
      )
    }

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

    let result;
    if (startTimestamp !== undefined && endTimestamp !== undefined) {
      result = await getMarketStartEndBlockByTimestamps(
        market,
        epochId,
        startTimestamp,
        endTimestamp,
        marketInfo.resource.priceIndexer.client
      );
    } else {
      result = await getMarketStartEndBlock(
        market,
        epochId,
        marketInfo.resource.priceIndexer.client
      );
    }
    const {startBlockNumber, endBlockNumber, error} = result;

    if (error || !startBlockNumber || !endBlockNumber) {
      return { missingBlockNumbers: null, error };
    }

    const resourcePrices = await resourcePriceRepository.find({
      where: {
        resource: { id: market.resource.id },
        blockNumber: Between(startBlockNumber, endBlockNumber),
      },
      select: ['blockNumber'],
    });

    const existingBlockNumbersSet = new Set(
      resourcePrices.map((ip: { blockNumber: number }) =>
        Number(ip.blockNumber)
      )
    );

    const missingBlockNumbers = [];
    for (
      let blockNumber = startBlockNumber;
      blockNumber <= endBlockNumber;
      blockNumber++
    ) {
      if (!existingBlockNumbersSet.has(blockNumber)) {
        missingBlockNumbers.push(blockNumber);
      }
    }

    await marketInfo.resource.priceIndexer.indexBlocks(
      market.resource,
      missingBlockNumbers
    );

    console.log(
      `Finished reindexing resource blocks for market ${address} on chain ${chainId}`
    );
  } catch (error) {
    console.error(`Error in reindexMissingBlocks:`, error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('address', address);
      scope.setExtra('epochId', epochId);
      Sentry.captureException(error);
    });
    throw error;
  }
}
