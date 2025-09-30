import { initializeDataSource } from '../../db';
import * as Sentry from '@sentry/node';
import PredictionMarketIndexer from '../indexers/predictionMarketIndexer';
import { Resource } from '../../../generated/prisma';
import prisma from '../../db';

export async function reindexPredictionMarket(
  chainId: number,
  startTimestamp?: number,
  endTimestamp?: number,
  clearExisting: boolean = false
) {
  try {
    console.log(
      `[PredictionMarket Reindex] Reindexing prediction market events on chain ${chainId} from ${
        startTimestamp
          ? new Date(startTimestamp * 1000).toISOString()
          : 'beginning'
      } to ${
        endTimestamp ? new Date(endTimestamp * 1000).toISOString() : 'now'
      }`
    );

    await initializeDataSource();

    // Clear existing data if requested
    if (clearExisting) {
      console.log(
        `[PredictionMarket Reindex] Clearing existing parlay and prediction market event data for chain ${chainId}`
      );

      // Delete parlays for this chain
      const deletedParlays = await prisma.parlay.deleteMany({
        where: { chainId },
      });

      // Delete events that are prediction market related (marketGroupId is null for these events)
      const deletedEvents = await prisma.event.deleteMany({
        where: {
          marketGroupId: null,
          // Additional filter to ensure we only delete prediction market events
          logData: {
            path: ['eventType'],
            string_contains: 'Prediction',
          },
        },
      });

      console.log(
        `[PredictionMarket Reindex] Cleared ${deletedParlays.count} parlays and ${deletedEvents.count} events`
      );
    }

    // Create a dummy resource for the indexer (similar to EAS pattern)
    const resource = {
      id: 0,
      slug: 'prediction-market-events',
      name: 'Prediction market events',
      description: 'Prediction market events indexer',
      createdAt: new Date(),
      categoryId: 1,
    } as Resource;

    // Create the PredictionMarket indexer for the specified chain
    const indexer = new PredictionMarketIndexer(chainId);

    // Use default timestamps if not provided
    const startTime =
      startTimestamp || Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60; // Default to 2 days ago
    const endTime = endTimestamp || Math.floor(Date.now() / 1000);

    console.log(
      `[PredictionMarket Reindex] Starting prediction market reindexing for resource ${resource.name} (${resource.slug}) on chain ${chainId}`
    );

    const result = await indexer.indexBlockPriceFromTimestamp(
      resource,
      startTime,
      endTime
    );

    if (result) {
      console.log(
        `[PredictionMarket Reindex] Successfully completed prediction market reindexing for chain ${chainId}`
      );

      // Log some statistics
      const parlayCount = await prisma.parlay.count({
        where: { chainId },
      });

      const eventCount = await prisma.event.count({
        where: {
          marketGroupId: null,
          logData: {
            path: ['eventType'],
            string_contains: 'Prediction',
          },
        },
      });

      console.log(
        `[PredictionMarket Reindex] Final counts - Parlays: ${parlayCount}, Events: ${eventCount}`
      );
    } else {
      console.error(
        `[PredictionMarket Reindex] Failed to complete prediction market reindexing for chain ${chainId}`
      );
    }

    return result;
  } catch (error) {
    console.error('Error in reindexPredictionMarket:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('startTimestamp', startTimestamp);
      scope.setExtra('endTimestamp', endTimestamp);
      scope.setExtra('clearExisting', clearExisting);
      Sentry.captureException(error);
    });
    throw error;
  }
}
