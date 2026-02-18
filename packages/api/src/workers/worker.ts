import 'reflect-metadata';
import { initializeDataSource } from '../db';
import { initializeFixtures, INDEXERS } from '../fixtures';
import { handleJobCommand } from './jobs';
import { createResilientProcess } from '../utils/utils';

async function main() {
  await initializeDataSource();
  await initializeFixtures();

  const indexerJobs = await startIndexers();
  await Promise.all(indexerJobs);
}

async function startIndexers(): Promise<Promise<void | (() => void)>[]> {
  const indexerJobs: Promise<void | (() => void)>[] = [];

  // Watch for new blocks for each indexer
  for (const [resourceSlug, indexer] of Object.entries(INDEXERS)) {
    if (indexer) {
      indexerJobs.push(
        createResilientProcess(
          () => indexer.watchBlocksForResource(resourceSlug) as Promise<void>,
          `watchBlocksForResource-${resourceSlug}`
        )()
      );
    }
  }

  return indexerJobs;
}

// Immediately try to handle a job command
(async () => {
  const handled = await handleJobCommand(process.argv);
  // If a job command was handled, the process will exit within the handler.

  // If no job command was handled, proceed with the default main logic
  if (!handled) {
    main();
  }
})();
