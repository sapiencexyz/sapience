import 'reflect-metadata';
import { initializeDataSource } from '../db';
import prisma from '../db';
import { initializeFixtures, INDEXERS } from '../fixtures';
import { handleJobCommand } from './jobs';
import { startIndexingAndWatchingMarketGroups as indexMarketsJob } from './jobs/indexMarkets';
import { createResilientProcess } from '../utils/utils';

async function main() {
  await initializeDataSource();
  let jobs: Promise<void | (() => void)>[] = [];

  await initializeFixtures();

  const marketJobs = await startMarketIndexers();
  const resourceJobs = await startResourceIndexers();

  jobs = [...marketJobs, ...resourceJobs];

  await Promise.all(jobs);
}

async function startMarketIndexers(): Promise<Promise<void | (() => void)>[]> {
  const distinctChainIdsResult = await prisma.market_group.findMany({
    select: { chainId: true },
    distinct: ['chainId'],
  });

  const chainIds: number[] = distinctChainIdsResult.map(
    (result) => result.chainId
  );

  const allMarketJobs: Promise<void | (() => void)>[] = chainIds.map(
    (chainId) =>
      createResilientProcess(
        () => indexMarketsJob(chainId),
        `indexMarketsJob-${chainId}`
      )()
  );

  return allMarketJobs;
}

async function startResourceIndexers(): Promise<
  Promise<void | (() => void)>[]
> {
  const resourceJobs: Promise<void | (() => void)>[] = [];
  // Watch for new blocks for each resource with an indexer
  for (const [resourceSlug, indexer] of Object.entries(INDEXERS)) {
    // Find the resource in the database
    const resource = await prisma.resource.findFirst({
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

async function runMarketsOnly() {
  await initializeDataSource();
  await initializeFixtures();

  const marketJobs = await startMarketIndexers();
  await Promise.all(marketJobs);
}

async function runResourcesOnly() {
  await initializeDataSource();
  await initializeFixtures();

  const resourceJobs = await startResourceIndexers();
  await Promise.all(resourceJobs);
}

// Handle command line arguments
async function handleWorkerCommands(args: string[]): Promise<boolean> {
  if (args.length <= 2) return false;

  const command = args[2];

  if (command === 'markets-only') {
    await runMarketsOnly();
    return true;
  }

  if (command === 'resources-only') {
    await runResourcesOnly();
    return true;
  }

  return false;
}

// Immediately try to handle a job command
(async () => {
  const handled = await handleJobCommand(process.argv);
  // If a job command was handled, the process will exit within the handler.

  // Check for worker-specific commands
  if (!handled) {
    const workerHandled = await handleWorkerCommands(process.argv);

    // If no worker command was handled, proceed with the default main logic
    if (!workerHandled) {
      main();
    }
  }
})();
