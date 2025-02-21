import 'reflect-metadata';
import {
  initializeDataSource,
  resourceRepository,
  marketRepository,
} from '../db';
import { indexMarketEvents, initializeMarket } from '../controllers/market';
import { MARKETS, RESOURCES } from '../fixtures';
import { createOrUpdateEpochFromContract } from '../controllers/marketHelpers';
import * as Sentry from '@sentry/node';
import { Resource } from '../models/Resource';
import { reindexMarket } from './reindexMarket';
import { reindexMissingBlocks } from './reindexMissingBlocks';
import { reindexResource } from './reindexResource';
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

async function initializeResources() {
  console.log('initializing resources');
  for (const resourceInfo of RESOURCES) {
    let resource = await resourceRepository.findOne({
      where: { name: resourceInfo.name },
    });

    if (!resource) {
      resource = new Resource();
      resource.name = resourceInfo.name;
      resource.slug = resourceInfo.slug;
      await resourceRepository.save(resource);
      console.log('created resource:', resourceInfo.name);
    } else if (!resource.slug) {
      // Update existing resources with slug if missing
      resource.slug = resourceInfo.slug;
      await resourceRepository.save(resource);
      console.log('updated resource with slug:', resourceInfo.name);
    }
  }
}

async function main() {
  await initializeDataSource();
  const jobs: Promise<void>[] = [];
  console.log('starting worker');

  // Initialize resources first
  await initializeResources();

  for (const marketInfo of MARKETS) {
    const resource = await resourceRepository.findOne({
      where: { name: marketInfo.resource.name },
    });
    if (!resource) {
      console.log(`Resource not found: ${marketInfo.resource.name}`);
      continue;
    }

    const market = await initializeMarket(marketInfo);
    console.log(
      'initialized market',
      market.address,
      'on chain',
      market.chainId
    );

    // Set the resource for the market
    market.resource = resource;
    await marketRepository.save(market);

    await createOrUpdateEpochFromContract(marketInfo, market);

    jobs.push(
      createResilientProcess(
        () => indexMarketEvents(market, marketInfo.deployment.abi),
        `indexMarketEvents-${market.address}`
      )()
    );
  }

  // Watch for new blocks for each resource
  for (const resourceInfo of RESOURCES) {
    const resource = await resourceRepository.findOne({
      where: { name: resourceInfo.name },
    });
    if (!resource) {
      console.log(`Resource not found: ${resourceInfo.name}`);
      continue;
    }

    if (resourceInfo.priceIndexer) {
      jobs.push(
        createResilientProcess(
          () => resourceInfo.priceIndexer.watchBlocksForResource(resource),
          `watchBlocksForResource-${resourceInfo.name}`
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
    console.log('DONE');
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
    console.log('DONE');
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
    await reindexResource(resource, startTimestamp, endTimestamp);

    process.exit(0);
  };
  callReindexResource();
  console.log('DONE');
} else {
  main();
}
