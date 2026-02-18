import { initializeDataSource } from '../../db';
import * as Sentry from '@sentry/node';
import EASPredictionIndexer from '../indexers/easIndexer';

export async function reindexEAS(
  chainId: number,
  startTimestamp?: number,
  endTimestamp?: number,
  overwriteExisting: boolean = false
) {
  try {
    console.log(
      `[EAS Reindex] Reindexing EAS attestations on chain ${chainId} from ${startTimestamp ? new Date(startTimestamp * 1000).toISOString() : 'beginning'} to ${endTimestamp ? new Date(endTimestamp * 1000).toISOString() : 'now'}`
    );

    await initializeDataSource();

    const resourceSlug = 'attestation-prediction-market';

    // Create the EAS indexer for the specified chain
    const indexer = new EASPredictionIndexer(chainId);

    // Use default timestamps if not provided
    const startTime =
      startTimestamp || Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // Default to 7 days ago
    const endTime = endTimestamp || Math.floor(Date.now() / 1000);

    console.log(
      `[EAS Reindex] Starting EAS reindexing for resource ${resourceSlug} on chain ${chainId}`
    );

    const result = await indexer.indexBlockPriceFromTimestamp(
      resourceSlug,
      startTime,
      endTime,
      overwriteExisting
    );

    if (result) {
      console.log(
        `[EAS Reindex] Successfully completed EAS reindexing for chain ${chainId}`
      );
    } else {
      console.error(
        `[EAS Reindex] Failed to complete EAS reindexing for chain ${chainId}`
      );
    }

    return result;
  } catch (error) {
    console.error('Error in reindexEAS:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('startTimestamp', startTimestamp);
      scope.setExtra('endTimestamp', endTimestamp);
      Sentry.captureException(error);
    });
    throw error;
  }
}
