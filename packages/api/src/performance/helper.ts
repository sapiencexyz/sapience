import { IntervalStore } from './types';
import { performanceCacheRepository } from '../db';

const STORAGE_VERSION = '1';

export async function persistStorage(
  storage: IntervalStore,
  latestResourceTimestamp: number,
  latestMarketTimestamp: number,
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
    storageVersion: STORAGE_VERSION,
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
  sectionName: string
): Promise<
  | {
      latestResourceTimestamp: number;
      latestMarketTimestamp: number;
      store: IntervalStore;
    }
  | undefined
> {
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
      storageVersion: STORAGE_VERSION,
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
      return value;
    }) as {
      fileVersion: number;
      latestResourceTimestamp: number;
      latestMarketTimestamp: number;
      store: IntervalStore;
    };
    console.timeEnd(
      `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
    );
    console.log(`  ResourcePerformance - -> Loaded storage from ${filename}`);
    if (storage.fileVersion !== FILE_VERSION) {
      console.log(
        `!! Storage file ${filename} has an unsupported version -${storage.fileVersion}-. Expected -${FILE_VERSION}-`
      );
      return undefined;
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
    return {
      latestResourceTimestamp: storage.latestResourceTimestamp,
      latestMarketTimestamp: storage.latestMarketTimestamp,
      store: storage.store,
    };
  } catch (error) {
    console.error(`!! Error loading storage from ${filename}: ${error}`);
    console.timeEnd(
      `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
    );
    return undefined;
  }
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
