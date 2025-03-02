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

  console.time(`  processResourceData.${resourceName}.${sectionName}.saveStorage`);
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true } );
  }

  const filename = path.join(storageDir, `${resourceSlug}-${sectionName}-storage.json`);
  // if (resourceSlug === 'arbitrum-gas') {
  // console.log(' LLL 1 ', latestTimestamp);
  // console.log(' LLL 2 ', storage);
  // // console.log(' LLL 3 ', JSON.stringify(storage['60'], (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // // console.log(' LLL 4 ', JSON.stringify(storage['300'], (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // // console.log(' LLL 5 ', JSON.stringify(storage['900'], (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // // console.log(' LLL 6 ', JSON.stringify(storage['1800'], (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // // console.log(' LLL 7 ', JSON.stringify(storage['14400'], (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // console.log(' LLL 8 ', JSON.stringify(storage['86400'].trailingAvgStore.metadata.length, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // console.log(' LLL 9 ', JSON.stringify(storage['86400'].trailingAvgStore.metadata[storage['86400'].trailingAvgStore.metadata.length - 1].trailingAvgData.length, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  // console.log(' LLL 10 ', JSON.stringify(
  //   // {
  //     // latestTimestamp,
  //     storage,
  //   // },
  //   (key, value) => (typeof value === 'bigint' ? value.toString() : value),
  //   2
  // ));
  // console.log(' LLL 11 ');
  // }
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

  console.timeEnd(`  processResourceData.${resourceName}.${sectionName}.saveStorage`);
  console.log(`  -> Saved storage to ${filename}`);
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

  console.time(`  processResourceData.${resourceName}.${sectionName}.loadStorage`);
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  const filename = path.join(storageDir, `${resourceSlug}-${sectionName}-storage.json`);
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

  console.timeEnd(`  processResourceData.${resourceName}.${sectionName}.loadStorage`);
  console.log(`  -> Loaded storage from ${filename}`);
  return {
    latestTimestamp: storage.latestTimestamp,
    store: storage.store,
  };
}

export function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}
