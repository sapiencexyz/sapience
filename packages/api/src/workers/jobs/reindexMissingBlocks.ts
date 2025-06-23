import prisma from '../../db';
import { initializeMarket } from '../../controllers/market';
import { getMarketStartEndBlock } from '../../controllers/marketHelpers';
import * as Sentry from '@sentry/node';
import { INDEXERS } from '../../fixtures';
import type { resource } from '../../../generated/prisma';

export async function reindexMissingBlocks(
  chainId: number,
  address: string,
  epochId: string
) {
  try {
    console.log(
      `Starting reindex of missing resource blocks for market ${chainId}:${address}, epoch ${epochId}`
    );

    const marketEntity = await prisma.market_group.findFirst({
      where: {
        chainId,
        address: address.toLowerCase(),
      },
      include: { resource: true },
    });

    if (!marketEntity) {
      throw new Error(
        `Market not found for chainId ${chainId} and address ${address}`
      );
    }

    const marketInfo = {
      marketChainId: marketEntity.chainId,
      deployment: {
        address: marketEntity.address?.toLowerCase() || '',
        deployTxnBlockNumber: marketEntity.deployTxnBlockNumber,
        deployTimestamp: marketEntity.deployTimestamp,
      },
      resource: {
        ...marketEntity.resource,
        priceIndexer: marketEntity.resource
          ? INDEXERS[marketEntity.resource.slug]
          : null,
      },
    };

    const market = await initializeMarket(marketInfo);

    // if this is not a crypto market, simply fetch latest data (leave this array empty)
    const missingBlockNumbers = [];

    // if this is a crypto market, fill the missing blocks
    if (
      marketInfo.resource &&
      marketInfo.resource?.priceIndexer &&
      marketInfo.resource.priceIndexer.client
    ) {
      const { startBlockNumber, endBlockNumber, error } =
        await getMarketStartEndBlock(
          market,
          epochId,
          marketInfo.resource.priceIndexer.client
        );

      if (error || !startBlockNumber || !endBlockNumber) {
        return { missingBlockNumbers: null, error };
      }

      const resourcePrices = await prisma.resource_price.findMany({
        where: {
          resourceId: market.resource?.id,
          blockNumber: {
            gte: startBlockNumber,
            lte: endBlockNumber,
          },
        },
        select: { blockNumber: true },
      });

      const existingBlockNumbersSet = new Set(
        resourcePrices.map((ip: { blockNumber: number }) =>
          Number(ip.blockNumber)
        )
      );

      for (
        let blockNumber = startBlockNumber;
        blockNumber <= endBlockNumber;
        blockNumber++
      ) {
        if (!existingBlockNumbersSet.has(blockNumber)) {
          missingBlockNumbers.push(blockNumber);
        }
      }
    }

    if (marketInfo.resource && marketInfo.resource?.priceIndexer) {
      await marketInfo.resource.priceIndexer.indexBlocks(
        market.resource as resource,
        missingBlockNumbers
      );
    }

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
