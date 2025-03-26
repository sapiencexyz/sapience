import {
  CandleData,
  IndexData,
  IntervalStore,
  StorageData,
  TrailingAvgStorage,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import { encode, decode } from '@msgpack/msgpack';
import { Resource } from 'src/models/Resource';
import { Epoch } from 'src/models/Epoch';
import { Store } from './types';

const FILE_VERSION = 5;

export async function persistToFile(
  storage: StorageData,
  trailingAvgStore: TrailingAvgStorage,
  resource: Resource,
  intervals: number[],
  trailingAvgTimes: number[],
  epochs: Epoch[]
) {
  if (process.env.SAVE_STORAGE !== 'true') {
    return;
  }

  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  let filename;
  for (const interval of intervals) {
    // persist resourceStore
    filename = path.join(
      storageDir,
      `${resource.slug}-${interval}-resourceStore.csv`
    );
    await persistStore(storage[interval.toString()].resourceStore, filename);

    // persist marketStore
    for (const epoch of epochs) {
      filename = path.join(
        storageDir,
        `${resource.slug}-${interval}-${epoch.id}-marketStore.csv`
      );
      await persistStore(
        storage[interval.toString()].marketStore[epoch.id],
        filename
      );
    }
    // persist indexStore
    for (const epoch of epochs) {
      filename = path.join(
        storageDir,
        `${resource.slug}-${interval}-${epoch.id}-indexStore.csv`
      );
      await persistStore(
        storage[interval.toString()].indexStore[epoch.id],
        filename
      );
    }

    // persist trailingAvgStore
    for (const trailingAvgTime of trailingAvgTimes) {
      filename = path.join(
        storageDir,
        `${resource.slug}-${interval}-${trailingAvgTime}-trailingAvgStore.csv`
      );
      await persistStore(
        storage[interval.toString()].trailingAvgStore[
          trailingAvgTime.toString()
        ],
        filename
      );
    }
  }
  // persist trailingAvgStore
  filename = path.join(storageDir, `${resource.slug}-trailingAvgStore.csv`);
  await persistTrailingAvgStore(trailingAvgStore, filename);
}

async function persistStore(store: Store, filename: string): Promise<void> {
  // Input validation
  if (!store  ) {
    throw new Error('Invalid store data provided');
  }

  if (!filename) {
    throw new Error('Filename is required');
  }

  // if (store.data.length !== store.metadata.length) {
  //   throw new Error('Data and metadata length mismatch');
  // }

  let writeStream: fs.WriteStream | null = null;

  try {
    // Ensure directory exists
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Check if file is writable
    await fs.promises.access(dir, fs.constants.W_OK).catch(() => {
      throw new Error(`Directory ${dir} is not writable`);
    });

    // Open file to write (overwrite)
    writeStream = fs.createWriteStream(filename, {
      flags: 'w',
      encoding: 'utf8',
      mode: 0o666,
    });

    // Handle stream errors
    writeStream.on('error', (error) => {
      throw new Error(`Stream error: ${error.message}`);
    });

    // Write CSV header
    const headerWritten = writeStream.write(
      'timestamp,open,high,low,close,startTimestamp,endTimestamp,used,feePaid\n'
    );
    if (!headerWritten) {
      await new Promise((resolve) => writeStream!.once('drain', resolve));
    }

    // For each item in the store
    for (let i = 0; i < store.data.length; i++) {
      const data = store.data[i];
      const metadata = store.metadata && store.metadata.length > i ? store.metadata[i] : undefined;

      // Validate data
      if (!data ) {
        throw new Error(`Invalid data at index ${i}`);
      }

      try {
        // Create a csv record with all the data and metadata
        const record = [
          data.t ?? '', // timestamp (both candle and index)
          (data as CandleData).o ?? '', // open
          (data as CandleData).h ?? '', // high
          (data as CandleData).l ?? '', // low
          (data as CandleData).c ?? '', // close
          (data as IndexData).v ?? '', // value
          (data as IndexData).c ?? '', // cumulative
          metadata?.st ?? '', // startTimestamp
          metadata?.et ?? '', // endTimestamp
          metadata?.u ?? '', // used
          metadata?.f ?? '', // feePaid
        ]
          .map((value) => {
            // Escape commas and quotes in values
            const stringValue = String(value);
            return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
          })
          .join(',');

        // Write the record with backpressure handling
        const recordWritten = writeStream.write(record + '\n');
        if (!recordWritten) {
          await new Promise((resolve) => writeStream!.once('drain', resolve));
        }
      } catch (error) {
        throw new Error(
          `Error processing record at index ${i}: ${error.message}`
        );
      }
    }

    // Close the file properly
    await new Promise<void>((resolve, reject) => {
      writeStream!.end((err: any) => {
        if (err) reject(new Error(`Error closing file: ${err.message}`));
        else resolve();
      });
    });

    // Verify file was written
    const stats = await fs.promises.stat(filename);
    if (stats.size === 0) {
      throw new Error('File was created but no data was written');
    }
  } catch (error) {
    // Clean up on error
    if (writeStream) {
      writeStream.destroy();
    }

    // Try to remove incomplete file
    try {
      if (fs.existsSync(filename)) {
        await fs.promises.unlink(filename);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed file:', cleanupError);
    }

    // Log and rethrow
    console.error(`Error persisting store to ${filename}:`, error);
    throw new Error(`Failed to persist store: ${error.message}`);
  } finally {
    // Ensure stream is closed
    if (writeStream && !writeStream.destroyed) {
      writeStream.destroy();
    }
  }
}

async function persistTrailingAvgStore(
  store: TrailingAvgStorage,
  filename: string
): Promise<void> {
  // Input validation
  if (!store) {
    throw new Error('Invalid trailing average store data provided');
  }

  if (!filename) {
    throw new Error('Filename is required');
  }

  let writeStream: fs.WriteStream | null = null;

  try {
    // Ensure directory exists
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Check if file is writable
    await fs.promises.access(dir, fs.constants.W_OK).catch(() => {
      throw new Error(`Directory ${dir} is not writable`);
    });

    // Open file to write (overwrite)
    writeStream = fs.createWriteStream(filename, {
      flags: 'w',
      encoding: 'utf8',
      mode: 0o666,
    });

    // Handle stream errors
    writeStream.on('error', (error) => {
      throw new Error(`Stream error: ${error.message}`);
    });

    // Write CSV header
    const headerWritten = writeStream.write(
      'timestamp,used,feePaid\n'
    );
    if (!headerWritten) {
      await new Promise((resolve) => writeStream!.once('drain', resolve));
    }

    // item in the store
    for (const item of store) {
      try {
        // Validate item
        if (!item || typeof item.t === 'undefined') {
          throw new Error('Invalid trailing average data point');
        }

        // Create a csv record
        const record = [
          item.t ?? '', // timestamp
          item.u ?? '', // used
          item.f ?? '', // feePaid
        ]
          .map((value) => {
            // Escape commas and quotes in values
            const stringValue = String(value);
            return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
          })
          .join(',');

        // Write the record with backpressure handling
        const recordWritten = writeStream.write(record + '\n');
        if (!recordWritten) {
          await new Promise((resolve) => writeStream!.once('drain', resolve));
        }
      } catch (error: any) {
        throw new Error(
          `Error processing trailing avg record: ${error.message}`
        );
      }
    }

    // Close the file properly
    await new Promise<void>((resolve, reject) => {
      writeStream!.end((err: any) => {
        if (err) reject(new Error(`Error closing file: ${err.message}`));
        else resolve();
      });
    });

    // Verify file was written
    const stats = await fs.promises.stat(filename);
    if (stats.size === 0) {
      throw new Error('File was created but no data was written');
    }
  } catch (error: any) {
    // Clean up on error
    if (writeStream) {
      writeStream.destroy();
    }

    // Try to remove incomplete file
    try {
      if (fs.existsSync(filename)) {
        await fs.promises.unlink(filename);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed file:', cleanupError);
    }

    // Log and rethrow
    console.error(`Error persisting trailing avg store to ${filename}:`, error);
    throw new Error(`Failed to persist trailing avg store: ${error.message}`);
  } finally {
    // Ensure stream is closed
    if (writeStream && !writeStream.destroyed) {
      writeStream.destroy();
    }
  }
}

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
    if (file.endsWith('-storage.msgpack')) {
      await fs.promises.unlink(path.join(storageDir, file));
    }
  }

  console.timeEnd('  ResourcePerformance - clearStorageFiles');
  console.log(
    `  ResourcePerformance --> Cleared ${files.length} storage files`
  );
}
