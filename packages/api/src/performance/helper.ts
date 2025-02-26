import { StorageData } from './types';
import * as fs from 'fs';
import * as path from 'path';

export async function saveStorageToFile(
  storage: StorageData,
  latestTimestamp: number,
  resourceSlug: string,
  resourceName: string
): Promise<undefined> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return;
  }

  console.time(`backfillResourcePrices.${resourceName}.saveStorage`);
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir);
  }

  const filename = path.join(storageDir, `${resourceSlug}-storage.json`);
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

  console.timeEnd(`backfillResourcePrices.${resourceName}.saveStorage`);
  console.log(`Saved storage to ${filename}`);
}

export async function loadStorageFromFile(
  resourceSlug: string,
  resourceName: string
): Promise<
  {
      latestTimestamp: number;
      store: StorageData;
    }
  | undefined
> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return undefined;
  }

  console.time(`backfillResourcePrices.${resourceName}.loadStorage`);
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  const filename = path.join(storageDir, `${resourceSlug}-storage.json`);
  if (!fs.existsSync(filename)) {
    console.log(`Storage file ${filename} does not exist`);
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
    store: StorageData;
  };

  console.timeEnd(`backfillResourcePrices.${resourceName}.loadStorage`);
  console.log(`Loaded storage from ${filename}`);
  return {
    latestTimestamp: storage.latestTimestamp,
    store: storage.store,
  };
}
