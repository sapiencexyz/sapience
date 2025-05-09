import { initializeDataSource, resourceRepository } from '../../db';
import { Resource } from '../../models/Resource';
import { reindexMarket } from './reindexMarket';
import { reindexMissingBlocks } from './reindexMissingBlocks';
import { reindexResource } from './reindexResource';
import { reindexMarketGroupFactory } from './reindexMarketGroupFactory';

const callReindex = async (argv: string[]) => {
  const chainId = parseInt(argv[3], 10);
  const address = argv[4];
  const marketId = argv[5];

  if (isNaN(chainId) || !address) {
    console.error(
      'Invalid arguments. Usage: tsx src/worker.ts reindexMarket <chainId> <address> <marketId>'
    );
    process.exit(1);
  }
  await reindexMarket(chainId, address, marketId);
  console.log('Done reindexing');
  process.exit(0);
};

const callReindexMissing = async (argv: string[]) => {
  const chainId = parseInt(argv[3], 10);
  const address = argv[4];
  const marketId = argv[5];

  if (isNaN(chainId) || !address || !marketId) {
    console.error(
      'Invalid arguments. Usage: tsx src/worker.ts reindexMissing <chainId> <address> <marketId>'
    );
    process.exit(1);
  }
  await reindexMissingBlocks(chainId, address, marketId);
  console.log('Done reindexing');
  process.exit(0);
};

const callReindexResource = async (argv: string[]) => {
  const slug = argv[3];
  const startTimestamp = parseInt(argv[4], 10);

  const endTimestamp =
    argv[5] !== 'undefined' ? parseInt(argv[5], 10) : undefined;

  if (isNaN(startTimestamp) || !slug) {
    console.error(
      'Invalid arguments. Usage: tsx src/worker.ts reindexResource <resourceSlug> <startTimestamp> <endTimestamp>'
    );
    process.exit(1);
  }
  await initializeDataSource(); // Ensure DB is initialized for this job
  const resource: Resource | null = await resourceRepository.findOne({
    where: {
      slug: slug,
    },
  });

  if (!resource) {
    console.error('Resource for the chosen slug was not found');
    process.exit(1); // Exit with error if resource not found
  }
  const result = await reindexResource(resource, startTimestamp, endTimestamp);

  if (!result) {
    console.error('Failed to reindex resource');
    process.exit(1);
  }

  console.log('Done reindexing');
  process.exit(0);
};

const callReindexMarketGroupFactory = async (argv: string[]) => {
  const chainId = parseInt(argv[3], 10);
  const factoryAddress = argv[4];

  if (isNaN(chainId) || !factoryAddress) {
    console.error(
      'Invalid arguments. Usage: tsx src/worker.ts reindexMarketGroupFactory <chainId> <factoryAddress>'
    );
    process.exit(1);
  }
  await reindexMarketGroupFactory(chainId, factoryAddress);
  console.log('Done reindexing market group factory');
  process.exit(0);
};

export async function handleJobCommand(argv: string[]): Promise<boolean> {
  const command = argv[2];

  switch (command) {
    case 'reindexMarket': {
      await callReindex(argv);
      return true; // Indicate a job command was handled
    }
    case 'reindexMissing': {
      await callReindexMissing(argv);
      return true; // Indicate a job command was handled
    }
    case 'reindexResource': {
      await callReindexResource(argv);
      return true; // Indicate a job command was handled
    }
    case 'reindexMarketGroupFactory': {
      await callReindexMarketGroupFactory(argv);
      return true; // Indicate a job command was handled
    }
    default: {
      // No specific job command matched
      return false;
    }
  }
}
