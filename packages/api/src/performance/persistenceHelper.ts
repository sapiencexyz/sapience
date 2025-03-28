import {
  CandleData,
  Datapoint,
  IndexData,
  StorageData,
  TrailingAvgStorage,
  // CandleMetadata,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Resource } from 'src/models/Resource';
import { Epoch } from 'src/models/Epoch';
import { Store, GenericMetadata, IndexMetadata, TrailingAvgMetadata } from './types';


const FORMAT_VERSION = 5;

export enum PersistMode {
  FILE = 'FILE',
  DATABASE = 'DATABASE',
}

export async function persist(
  mode: PersistMode,
  storage: StorageData,
  trailingAvgStore: TrailingAvgStorage,
  latestResourceTimestamp: number,
  latestMarketTimestamp: number,
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

    // Check if directory has read and write permissions
    await fs.promises
      .access(dir, fs.constants.R_OK | fs.constants.W_OK)
      .catch(() => {
        throw new Error(`Directory ${dir} is not readable and writable`);
      });
  } else if (mode === PersistMode.DATABASE) {
    // TODO: Implement database persistence
    console.error('Database persistence is not implemented');
    return;
  }

  await persistResourceMetadata(
    mode,
    resource.slug,
    FORMAT_VERSION,
    latestResourceTimestamp,
    latestMarketTimestamp,
  );

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

export async function restore(
  mode: PersistMode,
  resource: Resource,
  intervals: number[],
  trailingAvgTimes: number[],
  epochs: Epoch[]
): Promise<
  { storage: StorageData; trailingAvgStore: TrailingAvgStorage; latestResourceTimestamp: number, latestMarketTimestamp: number}  | undefined
> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return;
  }
  // Common validations
  if (!resource || !intervals || !trailingAvgTimes || !epochs) {
    throw new Error('Invalid request data provided');
  }

  // per mode specific validations
  if (mode === PersistMode.FILE) {
    const dir = process.env.STORAGE_PATH;
    if (!dir) {
      throw new Error('STORAGE_PATH is not set');
    }

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      return undefined;
    }

    // Check if directory has read and write permissions
    await fs.promises
      .access(dir, fs.constants.R_OK | fs.constants.W_OK)
      .catch(() => {
        throw new Error(`Directory ${dir} is not readable and writable`);
      });
  } else if (mode === PersistMode.DATABASE) {
    // TODO: Implement database persistence
    console.error('Database persistence is not implemented');
    return;
  }

  const metadata = await restoreResourceMetadata(
    mode,
    resource.slug,
  );


  if(!metadata || Number(metadata.version) !== FORMAT_VERSION) {
    console.warn(`Unsupported version: ${metadata?.version}`);
    return undefined;
  }

  let restored = false;
  const storage: StorageData = {};
  const trailingAvgStore: TrailingAvgStorage = [];

  let records: Store | undefined;
  for (const interval of intervals) {
    // restore from persisted resourceStore
    storage[interval] = {
      resourceStore:  {
        datapoints: []
      },
      marketStore: {},
      indexStore: {},
      trailingAvgStore: {}
    };
    records = await restoreRecords(
      mode,
      resource.slug,
      'resource',
      interval,
      undefined,
      undefined
    );
    if (records) {
      storage[interval].resourceStore = records;
      restored = true;
    }

    for (const epoch of epochs) {
      storage[interval].marketStore[epoch.id] = {
        datapoints: []
      };
      storage[interval].indexStore[epoch.id] = {
        datapoints: []
      };
      // restore marketStore
      records = await restoreRecords(
        mode,
        resource.slug,
        'market',
        interval,
        epoch.id,
        undefined
      );
      if (records) {
        storage[interval].marketStore[epoch.id] = records;
        restored = true;
      }
      // restore indexStore
      records = await restoreRecords(
        mode,
        resource.slug,
        'index',
        interval,
        epoch.id,
        undefined
      );
      if (records) {
        storage[interval].indexStore[epoch.id] = records;
        restored = true;
      }
    }
    for (const trailingAvgTime of trailingAvgTimes) {
      storage[interval].trailingAvgStore[trailingAvgTime] = {
        datapoints: []
      };
      records = await restoreRecords(
        mode,
        resource.slug,
        'trailingAvg',
        interval,
        undefined,
        trailingAvgTime
      );
      if (records) {
        storage[interval].trailingAvgStore[trailingAvgTime] = records;
        restored = true;
      }
    }
  }

  // // restore trailingAvgStore
  // for (const trailingAvgTime of trailingAvgTimes) {
  //   records = await restoreTrailingAvgRecords(
  //     mode,
  //     resource.slug,
  //     'trailingAvg',
  //     interval,
  //     undefined,
  //     trailingAvgTime,
  //   );
  //   if (records) {
  //     storage[interval].trailingAvgStore[trailingAvgTime] = records;
  //     restored = true;
  //   }
  // }
  return restored ? { storage, trailingAvgStore, latestResourceTimestamp: metadata.latestResourceTimestamp, latestMarketTimestamp: metadata.latestMarketTimestamp } : undefined;
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

async function persistResourceMetadata(
  mode: PersistMode,
  resourceSlug: string,
  version: number,
  latestResourceTimestamp: number,
  latestMarketTimestamp: number
) {
  if (mode == PersistMode.FILE) {
    const filename = path.join(process.env.STORAGE_PATH!, `${resourceSlug}-metadata.json`);
    const metadata = {
      version,
      latestResourceTimestamp,
      latestMarketTimestamp
    };
    await fs.promises.writeFile(filename, JSON.stringify(metadata, null, 2));
  } else if (mode == PersistMode.DATABASE) {
    // TODO: Implement database persistence
    console.error('Database persistence is not implemented');
  }
}

async function restoreResourceMetadata(
  mode: PersistMode,
  resourceSlug: string
): Promise<{version: number, latestResourceTimestamp: number, latestMarketTimestamp: number} | undefined> {
  if (mode == PersistMode.FILE) {
    const filename = path.join(process.env.STORAGE_PATH!, `${resourceSlug}-metadata.json`);
    if (!fs.existsSync(filename)) {
      return undefined;
    }
    const metadata = await fs.promises.readFile(filename, 'utf8');
    return JSON.parse(metadata);
  } else if (mode == PersistMode.DATABASE) {
    // TODO: Implement database persistence
    console.error('Database persistence is not implemented');
  }
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
    await storeRecordsToFile(
      resourceSlug,
      kind,
      interval,
      epochId,
      trailingAvgTime,
      store
    );
  } else if (mode == PersistMode.DATABASE) {
    await storeRecordsToDatabase(
      resourceSlug,
      kind,
      interval,
      epochId,
      trailingAvgTime,
      store
    );
  }
}

async function restoreRecords(
  mode: PersistMode,
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined
): Promise<Store | undefined> {
  if (mode === PersistMode.FILE) {
    return restoreRecordsFromFile(resourceSlug, kind, interval, epochId, trailingAvgTime);
  } else if (mode === PersistMode.DATABASE) {
    // TODO: Implement database persistence
    console.error('Database persistence is not implemented');
    return undefined;
  }
}

async function storeRecordsToFile(
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
  const length = store.datapoints ? store.datapoints.length : 0;

  let writeStream: fs.WriteStream | null = null;
  const filename = constructFilename(resourceSlug, kind, interval, epochId, trailingAvgTime);

  try {
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

    // Don't use header, because it's not needed for the file
    // // Write CSV header
    // const headerWritten = writeStream.write(
    //   'version,timestamp,open,high,low,close,value,cumulative,startTimestamp,endTimestamp,used,feePaid\n'
    // );
    // if (!headerWritten) {
    //   await new Promise((resolve) => writeStream!.once('drain', resolve));
    // }

    for (let i = 0; i < length; i++) {
      const datapoint = store.datapoints[i];
      try {
        const fileRecord = [
          datapoint.timestamp ?? '', // timestamp
          datapoint.endTimestamp ?? '', // endTimestamp
          (datapoint.data as CandleData).o ?? '', // open
          (datapoint.data as CandleData).h ?? '', // high
          (datapoint.data as CandleData).l ?? '', // low
          (datapoint.data as CandleData).c ?? '', // close
          (datapoint.data as IndexData).v ?? '', // value
          (datapoint.data as IndexData).c ?? '', // cumulative
          (datapoint.metadata as GenericMetadata).lastIncludedTimestamp ?? '', // lastIncludedTimestamp
          (datapoint.metadata as IndexMetadata).sumUsed ?? '', // sumUsed
          (datapoint.metadata as IndexMetadata).sumPaid ?? '', // sumPaid
          (datapoint.metadata as TrailingAvgMetadata).trailingStartTimestamp ?? '', // trailingStartTimestamp
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
    const stats = await fs.promises.stat(filename);
    if (stats.size === 0) {
      console.warn(`File was created but no data was written: ${filename}`);
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
    console.error(`Error persisting store to ${filename}:`, error);
    throw new Error(`Failed to persist store: ${error.message}`);
  } finally {
    // Ensure stream is closed
    if (writeStream && !writeStream.destroyed) {
      writeStream.destroy();
    }
  }
}

async function restoreRecordsFromFile(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined
): Promise<Store | undefined> {
  try {
    // Construct filename based on parameters
    const filename = constructFilename(resourceSlug, kind, interval, epochId, trailingAvgTime);
    
    // Check if file exists
    if (!fs.existsSync(filename)) {
      console.log(`No stored data found at ${filename}`);
      return undefined;
    }

    // Initialize store structure
    const store: Store = {
      datapoints: []
    };

    // Create readline interface
    const fileStream = fs.createReadStream(filename, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    // No header in the file
    // let isFirstLine = true; // To skip header

    const invalidVersion = false;
    // Process file line by line
    for await (const line of rl) {
      // Skip header
      // if (isFirstLine) {
      //   isFirstLine = false;
      //   continue;
      // }

      // Parse CSV line
      const values = parseCsvLine(line);
      if (values.length !== 12) { // Expected number of columns
        console.warn(`Invalid line format: ${line}`);
        continue;
      }

      const [
        timestamp,
        endTimestamp,
        open,
        high,
        low,
        close,
        value,
        cumulative,
        lastIncludedTimestamp,
        sumUsed,
        sumPaid,
        trailingStartTimestamp
      ] = values;

      // Create datapoint
      let data: CandleData | IndexData;
      if(value && cumulative) {
        data = { v: value, c: cumulative };
      } else {
        data = { o: open, h: high, l: low, c: close };
      }

      let metadata: GenericMetadata | IndexMetadata | TrailingAvgMetadata;

      if(trailingAvgTime) {
        metadata = { 
          lastIncludedTimestamp: parseInt(lastIncludedTimestamp), 
          sumUsed: sumUsed,
          sumPaid: sumPaid,
          trailingStartTimestamp: parseInt(trailingStartTimestamp) 
        };
      } else if(sumUsed || sumPaid) {
        metadata = { lastIncludedTimestamp: parseInt(lastIncludedTimestamp), 
          sumUsed: sumUsed, 
          sumPaid: sumPaid 
        };
      } else {
        metadata = { lastIncludedTimestamp: parseInt(lastIncludedTimestamp) };
      }

      const datapoint: Datapoint = {
        timestamp: parseInt(timestamp),
        endTimestamp: parseInt(endTimestamp),
        data: data,
        metadata: metadata
      };

      // Add to store
      store.datapoints.push(datapoint);
    }

    // Close the file stream
    fileStream.destroy();

    if(invalidVersion) {
      console.warn(`Invalid version in ${filename}`);
      return undefined;
    }

    // Validate restored data
    if (store.datapoints.length === 0) {
      console.log(`No valid data found in ${filename}`);
      return undefined;
    }

    // if (store.data.length !== store.metadata.length) {
    //   throw new Error('Data and metadata length mismatch in restored file');
    // }

    return store;

  } catch (error) {
    console.error(`Error restoring records from file: ${error}`);
    return undefined;
  }
}

function storeRecordsToDatabase(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined,
  store: Store
) {
  console.log('LLL storeRecordsToDatabase', resourceSlug, kind, interval, epochId, trailingAvgTime, store);
}

async function restoreRecordsFromDatabase(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId: number | undefined,
  trailingAvgTime: number | undefined
): Promise<Store | undefined> {
  console.log('LLL restoreRecordsFromDatabase', resourceSlug, kind, interval, epochId, trailingAvgTime);
  return undefined;
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

    // Check if directory has read and write permissions
    await fs.promises
      .access(dir, fs.constants.R_OK | fs.constants.W_OK)
      .catch(() => {
        throw new Error(`Directory ${dir} is not readable and writable`);
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

async function restoreTrailingAvgRecords(
  filename: string
): Promise<TrailingAvgStorage | undefined> {
  return undefined;
}

// Helper function to construct filename
function constructFilename(
  resourceSlug: string,
  kind: string,
  interval: number,
  epochId?: number,
  trailingAvgTime?: number
): string {
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  let filename = `${resourceSlug}-${interval}`;
  if (epochId) {
    filename += `-${epochId}`;
  }
  if (trailingAvgTime) {
    filename += `-${trailingAvgTime}`;
  }
  
  return path.join(storageDir, `${filename}-${kind}-store.csv`);
}

// Helper function to parse CSV line handling quoted values
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  // Add the last value
  values.push(currentValue.trim());

  return values;
}
