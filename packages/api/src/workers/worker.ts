/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { initializeDataSource, resourceRepository } from '../db';
import { indexMarketEvents } from '../controllers/market';
import { initializeFixtures, INDEXERS } from '../fixtures';
import { handleJobCommand } from './jobs';
import fixturesData from '../fixtures.json';
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
  const marketJobs: Promise<void>[] = [];
  for (const marketInfo of (fixturesData as any).MARKETS) {
    marketJobs.push(
      createResilientProcess(
        () =>
          indexMarketEvents({
            address: marketInfo.address,
            chainId: marketInfo.chainId,
            isYin: marketInfo.isYin || true,
            isCumulative: marketInfo.isCumulative || false,
          } as any),
        `indexMarketEvents-${marketInfo.address}`
      )()
    );
  }
  return marketJobs;
}

async function startResourceIndexers(): Promise<Promise<void>[]> {
  const resourceJobs: Promise<void>[] = [];
  // Watch for new blocks for each resource with an indexer
  for (const [resourceSlug, indexer] of Object.entries(INDEXERS)) {
    console.log('slug indexer', resourceSlug);
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
