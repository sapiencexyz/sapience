import { IntervalStore } from './types';
import { performanceCacheRepository } from '../db';

export async function persistStorage(
  storage: IntervalStore,
  latestTimestamp: number,
  resourceSlug: string,
  resourceName: string,
  interval: number,
  jsonSection: string
): Promise<undefined> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return;
  }

  console.time(
    `  ResourcePerformance - processResourceData.${resourceName}.${interval}.${jsonSection}.saveStorage`
  );

  // Create or update the cache entry
  await performanceCacheRepository.save({
    resourceSlug,
    interval,
    jsonSection,
    storageVersion: '1', // You may want to manage versions
    latestTimestamp,
    storage: JSON.stringify(storage, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ),
  });

  console.timeEnd(
    `  ResourcePerformance - processResourceData.${resourceName}.${interval}.${jsonSection}.saveStorage`
  );
  console.log(`  ResourcePerformance --> Saved storage to database`);
}

export async function restorePersistedStorage(
  resourceSlug: string,
  resourceName: string,
  interval: number,
  jsonSection: string
): Promise<{ latestTimestamp: number; store: IntervalStore } | undefined> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return undefined;
  }

  console.time(
    `  ResourcePerformance - processResourceData.${resourceName}.${interval}.${jsonSection}.loadStorage`
  );

  const cacheEntry = await performanceCacheRepository.findOne({
    where: {
      resourceSlug,
      interval,
      jsonSection,
      storageVersion: '1',
    },
    order: {
      createdAt: 'DESC',
    },
  });

  if (!cacheEntry) {
    console.log(
      `!! Storage entry for ${resourceSlug}-${interval}-${jsonSection} does not exist`
    );
    return undefined;
  }

  const storage = JSON.parse(cacheEntry.storage, (key, value) => {
    // Convert string numbers that might be bigints back to bigint
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
    return value;
  });

  console.timeEnd(
    `  ResourcePerformance - processResourceData.${resourceName}.${interval}.${jsonSection}.loadStorage`
  );
  console.log(`  ResourcePerformance - -> Loaded storage from database`);

  return {
    latestTimestamp: cacheEntry.latestTimestamp,
    store: storage,
  };
}

export async function clearPersistedStore(): Promise<void> {
  console.time('  ResourcePerformance - clearStorage');

  await performanceCacheRepository.delete({});

  console.timeEnd('  ResourcePerformance - clearStorage');
  console.log('  ResourcePerformance --> Cleared performance cache storage');
}

export function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}
