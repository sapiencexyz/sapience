import 'reflect-metadata';
import {
  initializeDataSource,
  resourceRepository,
  marketGroupRepository,
} from '../db';
import { initializeFixtures, INDEXERS } from '../fixtures';
import { handleJobCommand } from './jobs';
import { startIndexingAndWatchingMarketGroups as indexMarketsJob } from './jobs/indexMarkets';
import { createResilientProcess } from '../utils';

async function main() {
  await initializeDataSource();
  let jobs: Promise<void>[] = [];

  await initializeFixtures();

  const marketJobs = await startMarketIndexers();
  const resourceJobs = await startResourceIndexers();

  jobs = [...marketJobs, ...resourceJobs];

  await Promise.all(jobs);
}

async function startMarketIndexers(): Promise<Promise<void>[]> {
  const distinctChainIdsResult = await marketGroupRepository
    .createQueryBuilder('marketGroup')
    .select('DISTINCT "chainId"')
    .getRawMany();

  const chainIds: number[] = distinctChainIdsResult.map(
    (result) => result.chainId
  );

  const allMarketJobs: Promise<void>[] = chainIds.map((chainId) =>
    createResilientProcess(
      () => indexMarketsJob(chainId),
      `indexMarketsJob-${chainId}`
    )()
  );

  return allMarketJobs;
}

async function startResourceIndexers(): Promise<Promise<void>[]> {
  const resourceJobs: Promise<void>[] = [];
  // Watch for new blocks for each resource with an indexer
  for (const [resourceSlug, indexer] of Object.entries(INDEXERS)) {
    // Find the resource in the database
    const resource = await resourceRepository.findOne({
      where: { slug: resourceSlug },
    });

    if (!resource) {
      console.log(`Resource not found: ${resourceSlug}`);
      continue;
    }

    if (indexer) {
      // Then start watching for new blocks
      resourceJobs.push(
        createResilientProcess(
          () => indexer.watchBlocksForResource(resource) as Promise<void>,
          `watchBlocksForResource-${resourceSlug}`
        )()
      );
    }
  }
  return resourceJobs;
}

// Immediately try to handle a job command
(async () => {
  const handled = await handleJobCommand(process.argv);
  // If a job command was handled, the process will exit within the handler.
  // If not handled, proceed with the default main logic.
  if (!handled) {
    main();
  }
})();
