import { initializeDataSource } from '../../db';
import * as Sentry from '@sentry/node';
import ConditionSettledIndexer from '../indexers/conditionSettledIndexer';

export async function reindexConditionSettled(
  chainId: number,
  resolverAddress: `0x${string}`,
  startTimestamp?: number,
  endTimestamp?: number,
  isLegacy: boolean = false
) {
  try {
    console.log(
      `[ConditionSettled Reindex] Reindexing on chain ${chainId} resolver ${resolverAddress} (legacy: ${isLegacy}) from ${startTimestamp ? new Date(startTimestamp * 1000).toISOString() : '2 days ago'} to ${endTimestamp ? new Date(endTimestamp * 1000).toISOString() : 'now'}`
    );

    await initializeDataSource();

    const resourceSlug = 'condition-settled';
    const indexer = new ConditionSettledIndexer(
      chainId,
      resolverAddress,
      isLegacy
    );

    const startTime =
      startTimestamp !== undefined
        ? startTimestamp
        : Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const endTime =
      endTimestamp !== undefined ? endTimestamp : Math.floor(Date.now() / 1000);

    console.log(
      `[ConditionSettled Reindex] Starting reindex for chain ${chainId}`
    );

    const result = await indexer.indexBlockPriceFromTimestamp(
      resourceSlug,
      startTime,
      endTime
    );

    if (result) {
      console.log(
        `[ConditionSettled Reindex] Successfully completed for chain ${chainId}`
      );
    } else {
      console.error(`[ConditionSettled Reindex] Failed for chain ${chainId}`);
    }

    return result;
  } catch (error) {
    console.error('Error in reindexConditionSettled:', error);
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setExtra('chainId', chainId);
      scope.setExtra('startTimestamp', startTimestamp);
      scope.setExtra('endTimestamp', endTimestamp);
      Sentry.captureException(error);
    });
    throw error;
  }
}
