import { StorageData } from './types';
import * as fs from 'fs';
import * as path from 'path';

export async function saveStorageToFile(
  storage: StorageData,
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
      storage,
      (key, value) => typeof value === 'bigint' ? value.toString() : value,
      2
    )
  );

  console.timeEnd(`backfillResourcePrices.${resourceName}.saveStorage`);
  console.log(`Saved storage to ${filename}`);
} 