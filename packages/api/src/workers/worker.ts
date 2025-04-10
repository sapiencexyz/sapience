/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { initializeDataSource, resourceRepository } from '../db';
import { indexMarketEvents } from '../controllers/market';
import { initializeFixtures, INDEXERS } from '../fixtures';
import * as Sentry from '@sentry/node';
import { Resource } from '../models/Resource';
import { reindexMarket } from './reindexMarket';
import { reindexMissingBlocks } from './reindexMissingBlocks';
import { reindexResource } from './reindexResource';
import fixturesData from '../fixtures.json';
const MAX_RETRIES = Infinity;
const RETRY_DELAY = 5000; // 5 seconds

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  operation: () => Promise<T>,
  name: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Attempt ${attempt}/${maxRetries} failed for ${name}:`,
        error
      );

      // Report error to Sentry with context
      Sentry.withScope((scope) => {
        scope.setExtra('attempt', attempt);
        scope.setExtra('maxRetries', maxRetries);
        scope.setExtra('operationName', name);
        Sentry.captureException(error);
      });

      if (attempt < maxRetries) {
        console.log(`Retrying ${name} in ${RETRY_DELAY / 1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  const finalError = new Error(
    `All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`
  );
  Sentry.captureException(finalError);
  throw finalError;
}

function createResilientProcess<T>(
  process: () => Promise<T>,
  name: string
): () => Promise<T | void> {
  return async () => {
    while (true) {
      try {
        return await withRetry(process, name);
      } catch (error) {
        console.error(
          `Process ${name} failed after all retries. Restarting...`,
          error
        );
        await delay(RETRY_DELAY);
      }
    }
  };
}

async function main() {
  await initializeDataSource();
  const jobs: Promise<void>[] = [];
  console.log('starting worker');

  // Initialize resources from fixtures
  await initializeFixtures();

  for (const marketInfo of fixturesData.MARKETS) {
    jobs.push(
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
      jobs.push(
        createResilientProcess(
          () => indexer.watchBlocksForResource(resource) as Promise<void>,
          `watchBlocksForResource-${resourceSlug}`
        )()
      );
    }
  }

  await Promise.all(jobs);
}

if (process.argv[2] === 'reindexMarket') {
  const callReindex = async () => {
    const chainId = parseInt(process.argv[3], 10);
    const address = process.argv[4];
    const epochId = process.argv[5];

    if (isNaN(chainId) || !address) {
      console.error(
        'Invalid arguments. Usage: tsx src/worker.ts reindexMarket <chainId> <address> <epochId>'
      );
      process.exit(1);
    }
    await reindexMarket(chainId, address, epochId);
    console.log('Done reindexing');
    process.exit(0);
  };
  callReindex();
} else if (process.argv[2] === 'reindexMissing') {
  const callReindexMissing = async () => {
    const chainId = parseInt(process.argv[3], 10);
    const address = process.argv[4];
    const epochId = process.argv[5];

    if (isNaN(chainId) || !address || !epochId) {
      console.error(
        'Invalid arguments. Usage: tsx src/worker.ts reindexMissing <chainId> <address> <epochId>'
      );
      process.exit(1);
    }
    await reindexMissingBlocks(chainId, address, epochId);
    console.log('Done reindexing');
    process.exit(0);
  };
  callReindexMissing();
} else if (process.argv[2] === 'reindexResource') {
  const callReindexResource = async () => {
    const slug = process.argv[3];
    const startTimestamp = parseInt(process.argv[4], 10);

    const endTimestamp =
      process.argv[5] !== 'undefined'
        ? parseInt(process.argv[5], 10)
        : undefined;

    if (isNaN(startTimestamp) || !slug) {
      console.error(
        'Invalid arguments. Usage: tsx src/worker.ts reindexResource <resourceSlug> <startTimestamp> <endTimestamp>'
      );
      process.exit(1);
    }
    await initializeDataSource();
    const resource: Resource | null = await resourceRepository.findOne({
      where: {
        slug: slug,
      },
    });

    if (!resource) {
      throw new Error('Resource for the chosen slug was not found');
    }
    const result = await reindexResource(
      resource,
      startTimestamp,
      endTimestamp
    );

    if (!result) {
      console.error('Failed to reindex resource');
      process.exit(1);
    }

    process.exit(0);
  };

  await callReindexResource();

  console.log('Done reindexing');
} else {
  main();
}
