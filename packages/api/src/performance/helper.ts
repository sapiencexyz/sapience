import { IntervalStore } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { encode, decode } from '@msgpack/msgpack';

const FILE_VERSION = 4;

export async function saveStorageToFile(
  storage: IntervalStore,
  latestResourceTimestamp: number,
  latestMarketTimestamp: number,
  resourceSlug: string,
  resourceName: string,
  sectionName: string
): Promise<undefined> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return;
  }

  console.time(
    `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.saveStorage`
  );
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filename = path.join(
    storageDir,
    `${resourceSlug}-${sectionName}-storage.msgpack`
  );

  const data = {
    fileVersion: FILE_VERSION,
    latestResourceTimestamp,
    latestMarketTimestamp,
    store: storage,
  };

  // Encode and save
  const buffer = encode(data);
  await fs.promises.writeFile(filename, buffer);

  console.timeEnd(
    `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.saveStorage`
  );
  console.log(
    `  ResourcePerformance --> Saved storage to ${filename} (${buffer.length} bytes)`
  );
}

export async function loadStorageFromFile(
  resourceSlug: string,
  resourceName: string,
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
    `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
  );
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  const filename = path.join(
    storageDir,
    `${resourceSlug}-${sectionName}-storage.msgpack`
  );

  try {
    const buffer = await fs.promises.readFile(filename);
    const data = decode(buffer) as {
      fileVersion: number;
      latestResourceTimestamp: number;
      latestMarketTimestamp: number;
      store: IntervalStore;
    };

    if (data.fileVersion !== FILE_VERSION) {
      console.log(
        `!! Storage file ${filename} has an unsupported version -${data.fileVersion}-. Expected -${FILE_VERSION}-`
      );
      return undefined;
    }

    console.timeEnd(
      `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
    );
    console.log(`  ResourcePerformance - -> Loaded storage from ${filename}`);
    return {
      latestResourceTimestamp: data.latestResourceTimestamp,
      latestMarketTimestamp: data.latestMarketTimestamp,
      store: data.store,
    };
  } catch (error) {
    console.log(`  ResourcePerformance - load storage failed: ${error}`);
    console.timeEnd(
      `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
    );
    return undefined;
  }
}

export async function clearStorageFiles(): Promise<void> {
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  if (!fs.existsSync(storageDir)) {
    return; // Nothing to clear
  }

  console.time('  ResourcePerformance - clearStorageFiles');

  const files = await fs.promises.readdir(storageDir);
  for (const file of files) {
    if (file.endsWith('-storage.json')) {
      await fs.promises.unlink(path.join(storageDir, file));
    }
  }

  console.timeEnd('  ResourcePerformance - clearStorageFiles');
  console.log(
    `  ResourcePerformance --> Cleared ${files.length} storage files`
  );
}

export function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

export function startOfCurrentInterval(
  timestamp: number,
  interval: number
): number {
  return Math.floor(timestamp / interval) * interval;
}

export function startOfNextInterval(
  timestamp: number,
  interval: number
): number {
  return (Math.floor(timestamp / interval) + 1) * interval;
}

export function getTimeWindow(from: number, to: number, interval: number) {
  return {
    from: startOfCurrentInterval(from, interval),
    to: startOfNextInterval(to, interval),
  };
}
