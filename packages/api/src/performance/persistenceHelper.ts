import {
  CandleData,
  IndexData,
  IntervalStore,
  StorageData,
  TrailingAvgStorage,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import { Resource } from 'src/models/Resource';
import { Epoch } from 'src/models/Epoch';
import { Store } from './types';

const FORMAT_VERSION = 5;

export enum PersistMode {
  FILE = 'FILE',
  DATABASE = 'DATABASE',
}

export async function persist(
  mode: PersistMode,
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
  // Common validations
  if (
    !storage ||
    !trailingAvgStore ||
    !resource ||
    !intervals ||
    !trailingAvgTimes ||
    !epochs
  ) {
    throw new Error('Invalid data provided');
  }

  // per mode specific validations
  if (mode === PersistMode.FILE) {
    const dir = process.env.STORAGE_PATH;
    if (!dir) {
      throw new Error('STORAGE_PATH is not set');
    }

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Check if file is writable
    await fs.promises.access(dir, fs.constants.W_OK).catch(() => {
      throw new Error(`Directory ${dir} is not writable`);
    });
  }

  for (const interval of intervals) {
    // persist resourceStore
    await storeRecords(
      mode,
      resource.slug,
      'resource',
      interval,
      undefined,
      undefined,
      storage[interval].resourceStore
    );

    for (const epoch of epochs) {
      // persist marketStore
      await storeRecords(
        mode,
        resource.slug,
        'market',
        interval,
        epoch.id,
        undefined,
        storage[interval].marketStore[epoch.id]
      );
      // persist indexStore
      await storeRecords(
        mode,
        resource.slug,
        'index',
        interval,
        epoch.id,
        undefined,
        storage[interval].indexStore[epoch.id]
      );
    }

    // persist trailingAvgStore
    for (const trailingAvgTime of trailingAvgTimes) {
      await storeRecords(
        mode,
        resource.slug,
        'trailingAvg',
        interval,
        undefined,
        trailingAvgTime,
        storage[interval].trailingAvgStore[trailingAvgTime]
      );
    }
  }

  // persist trailingAvgStore
  // await persistTrailingAvgStore(
  //   trailingAvgStore,
  //   path.join(process.env.STORAGE_PATH!, `${resource.slug}-trailingAvg-store.csv`)
  // );
}

async function storeRecords(
  mode: PersistMode,
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined,
  store: Store
) {
  if (mode == PersistMode.FILE) {
    await storeRecordsFile(
      resourceSlug,
      kind,
      interval,
      epochId,
      trailingAvgTime,
      store
    );
  } else if (mode == PersistMode.DATABASE) {
    await storeRecordsDatabase(
      resourceSlug,
      kind,
      interval,
      epochId,
      trailingAvgTime,
      store
    );
  }
}

async function storeRecordsFile(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined,
  store: Store
) {
  if (!store) {
    return;
  }
  const length = store.data ? store.data.length : 0;
  const dir = process.env.STORAGE_PATH!; // Notice, dir is already checked when this function is called

  let writeStream: fs.WriteStream | null = null;
  let filepath: string = '';
  let filename = `${resourceSlug}-${interval}`;
  if (epochId) {
    filename += `-${epochId}`;
  }
  if (trailingAvgTime) {
    filename += `-${trailingAvgTime}`;
  }
  filename += `-${kind}-store.csv`;
  filepath = path.join(dir, filename);

  try {
    // Open file to write (overwrite)
    writeStream = fs.createWriteStream(filepath, {
      flags: 'w',
      encoding: 'utf8',
      mode: 0o666,
    });

    // Handle stream errors
    writeStream.on('error', (error) => {
      throw new Error(`Stream error: ${error.message}`);
    });

    // Don't use header, because it's not needed for the file
    // // Write CSV header 
    // const headerWritten = writeStream.write(
    //   'version,timestamp,open,high,low,close,value,cumulative,startTimestamp,endTimestamp,used,feePaid\n'
    // );
    // if (!headerWritten) {
    //   await new Promise((resolve) => writeStream!.once('drain', resolve));
    // }

  for (let i = 0; i < length; i++) {
    const data = store.data[i];
    const metadata = store.metadata ? store.metadata[i] : undefined;
    // const record = {
    //   version: FORMAT_VERSION,
    //   interval,
    //   epochId,
    //   trailingAvgTime,
    //   resourceSlug,
    //   timestamp: data.t ?? '', // timestamp
    //   open: (data as CandleData).o ?? '', // open
    //   high: (data as CandleData).h ?? '', // high
    //   low: (data as CandleData).l ?? '', // low
    //   close: (data as CandleData).c ?? '', // close
    //   value: (data as IndexData).v ?? '', // value
    //   cumulative: (data as IndexData).c ?? '', // cumulative
    //   startTimestamp: metadata?.st ?? '', // startTimestamp
    //   endTimestamp: metadata?.et ?? '', // endTimestamp
    //   used: metadata?.u ?? '', // used
    //   feePaid: metadata?.f ?? '', // feePaid
    // };

    try {
      const fileRecord = [
        FORMAT_VERSION,
        data.t ?? '', // timestamp
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
        const recordWritten = writeStream!.write(fileRecord + '\n');
        if (!recordWritten) {
          await new Promise((resolve) => writeStream!.once('drain', resolve));
        }
      } catch (error: any) {
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
    const stats = await fs.promises.stat(filepath);
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
      if (fs.existsSync(filepath)) {
        await fs.promises.unlink(filepath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up failed file:', cleanupError);
    }

    // Log and rethrow
    console.error(`Error persisting store to ${filepath}:`, error);
    throw new Error(`Failed to persist store: ${error.message}`);
  } finally {
    // Ensure stream is closed
    if (writeStream && !writeStream.destroyed) {
      writeStream.destroy();
    }
  }
}

function storeRecordsDatabase(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined,
  store: Store
) {}

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
    const headerWritten = writeStream.write('timestamp,used,feePaid\n');
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
    fileVersion: FORMAT_VERSION,
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

    if (data.fileVersion !== FORMAT_VERSION) {
      console.log(
        `!! Storage file ${filename} has an unsupported version -${data.fileVersion}-. Expected -${FORMAT_VERSION}-`
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
    if (
      file.endsWith('-storage.json') ||
      file.endsWith('-storage.msgpack') ||
      file.endsWith('-store.csv')
    ) {
      await fs.promises.unlink(path.join(storageDir, file));
    }
  }

  console.timeEnd('  ResourcePerformance - clearStorageFiles');
  console.log(
    `  ResourcePerformance --> Cleared ${files.length} storage files`
  );
}
