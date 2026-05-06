import { initializeDataSource } from '../../core/db';
import EASPredictionIndexer from '../indexers/easIndexer';
import { createLogger } from '../../core/logger';

const log = createLogger('workers.jobs.reindexEAS');

export async function reindexEAS(
  chainId: number,
  startTimestamp?: number,
  endTimestamp?: number,
  overwriteExisting: boolean = false
) {
  try {
    log.info(
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

    log.info(
      `[EAS Reindex] Starting EAS reindexing for resource ${resourceSlug} on chain ${chainId}`
    );

    const result = await indexer.indexBlockPriceFromTimestamp(
      resourceSlug,
      startTime,
      endTime,
      overwriteExisting
    );

    if (result) {
      log.info(
        `[EAS Reindex] Successfully completed EAS reindexing for chain ${chainId}`
      );
    } else {
      log.error(
        `[EAS Reindex] Failed to complete EAS reindexing for chain ${chainId}`
      );
    }

    return result;
  } catch (error) {
    log.error(
      { err: error, chainId, startTimestamp, endTimestamp },
      'Error in reindexEAS'
    );
    throw error;
  }
}
