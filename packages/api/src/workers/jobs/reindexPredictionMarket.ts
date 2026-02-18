import { initializeDataSource } from '../../db';
import * as Sentry from '@sentry/node';
import PredictionMarketIndexer from '../indexers/predictionMarketIndexer';
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
        `[PredictionMarket Reindex] Clearing existing position and prediction market event data for chain ${chainId}`
      );

      const predictionMarketEvents = await prisma.event.findMany({
        where: {
          logData: {
            path: ['eventType'],
            string_contains: 'Prediction',
          },
        },
        select: { id: true },
      });

      const eventIds = predictionMarketEvents.map((e) => e.id);

      if (eventIds.length > 0) {
        console.log(
          `[PredictionMarket Reindex] Found ${eventIds.length} prediction market events to consider`
        );
      }

      // Delete positions for this chain
      const deletedPositions = await prisma.position.deleteMany({
        where: { chainId },
      });

      // Delete events that are prediction market related
      const deletedEvents = await prisma.event.deleteMany({
        where: {
          logData: {
            path: ['eventType'],
            string_contains: 'Prediction',
          },
        },
      });

      console.log(
        `[PredictionMarket Reindex] Cleared ${deletedPositions.count} positions and ${deletedEvents.count} events`
      );
    }

    const resourceSlug = `prediction-market-events-${chainId}`;

    // Create the PredictionMarket indexer for the specified chain
    const indexer = new PredictionMarketIndexer(chainId);

    // Use default timestamps if not provided
    const startTime =
      startTimestamp || Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60; // Default to 2 days ago
    const endTime = endTimestamp || Math.floor(Date.now() / 1000);

    console.log(
      `[PredictionMarket Reindex] Starting prediction market reindexing for resource ${resourceSlug} on chain ${chainId}`
    );

    const result = await indexer.indexBlockPriceFromTimestamp(
      resourceSlug,
      startTime,
      endTime
    );

    if (result) {
      console.log(
        `[PredictionMarket Reindex] Successfully completed prediction market reindexing for chain ${chainId}`
      );

      // Log some statistics
      const positionCount = await prisma.position.count({
        where: { chainId },
      });

      const eventCount = await prisma.event.count({
        where: {
          logData: {
            path: ['eventType'],
            string_contains: 'Prediction',
          },
        },
      });

      console.log(
        `[PredictionMarket Reindex] Final counts - Positions: ${positionCount}, Events: ${eventCount}`
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
