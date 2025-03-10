import { IntervalStore } from './types';
import * as fs from 'fs';
import * as path from 'path';

export async function saveStorageToFile(
  storage: IntervalStore,
  latestTimestamp: number,
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
    `${resourceSlug}-${sectionName}-storage.json`
  );
  await fs.promises.writeFile(
    filename,
    JSON.stringify(
      {
        latestTimestamp,
        store: storage,
      },
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    )
  );

  console.timeEnd(
    `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.saveStorage`
  );
  console.log(`  ResourcePerformance --> Saved storage to ${filename}`);
}

export async function loadStorageFromFile(
  resourceSlug: string,
  resourceName: string,
  sectionName: string
): Promise<
  | {
      latestTimestamp: number;
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
    `${resourceSlug}-${sectionName}-storage.json`
  );
  if (!fs.existsSync(filename)) {
    console.log(`!! Storage file ${filename} does not exist`);
    return undefined;
  }

  const fileContent = await fs.promises.readFile(filename, 'utf-8');
  const storage = JSON.parse(fileContent, (key, value) => {
    // Convert string numbers that might be bigints back to bigint
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
    return value;
  }) as {
    latestTimestamp: number;
    store: IntervalStore;
  };

  console.timeEnd(
    `  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`
  );
  console.log(`  ResourcePerformance - -> Loaded storage from ${filename}`);
  return {
    latestTimestamp: storage.latestTimestamp,
    store: storage.store,
  };
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
  console.log(`  ResourcePerformance --> Cleared ${files.length} storage files`);
}

export function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}
