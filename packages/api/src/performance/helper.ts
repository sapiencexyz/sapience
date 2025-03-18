import { IntervalStore } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { StorageData } from './proto/storage';
import * as protobuf from 'protobufjs';

const FILE_VERSION = 2;

let protoRoot: protobuf.Root | null = null;

async function loadProtoSchema() {
  if (!protoRoot) {
    protoRoot = await protobuf.load(path.join(__dirname, 'proto', 'storage.proto'));
  }
  return protoRoot;
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

  console.time(`  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.saveStorage`);
  
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filename = path.join(storageDir, `${resourceSlug}-${sectionName}-storage.pb`);
  
  // Convert storage to protobuf format
  const root = await loadProtoSchema();
  const StorageMessage = root.lookupType('foil.storage.StorageData');
  
  // Transform the data into protobuf format
  const protoData = {
    fileVersion: FILE_VERSION,
    latestResourceTimestamp,
    latestMarketTimestamp,
    intervalData: Object.entries(storage).reduce((acc, [interval, data]) => {
      acc[interval] = transformToProtoFormat(data);
      return acc;
    }, {} as any)
  };

  // Verify the data
  const errMsg = StorageMessage.verify(protoData);
  if (errMsg) throw Error(errMsg);

  // Create and encode the message
  const message = StorageMessage.create(protoData);
  const buffer = StorageMessage.encode(message).finish();

  // Write to file
  await fs.promises.writeFile(filename, buffer);

  console.timeEnd(`  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.saveStorage`);
  console.log(`  ResourcePerformance --> Saved storage to ${filename}`);
}

export async function loadStorageFromFile(
  resourceSlug: string,
  resourceName: string,
  sectionName: string
): Promise<{
  latestResourceTimestamp: number;
  latestMarketTimestamp: number;
  store: IntervalStore;
} | undefined> {
  if (process.env.SAVE_STORAGE !== 'true') {
    return undefined;
  }

  console.time(`  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`);
  
  const storageDir = process.env.STORAGE_PATH;
  if (!storageDir) {
    throw new Error('STORAGE_PATH is not set');
  }

  const filename = path.join(storageDir, `${resourceSlug}-${sectionName}-storage.pb`);
  if (!fs.existsSync(filename)) {
    console.log(`!! Storage file ${filename} does not exist`);
    return undefined;
  }

  try {
    // Read the binary file
    const buffer = await fs.promises.readFile(filename);
    
    // Decode the protobuf message
    const root = await loadProtoSchema();
    const StorageMessage = root.lookupType('foil.storage.StorageData');
    const decoded = StorageMessage.decode(buffer);
    const data = StorageMessage.toObject(decoded, {
      longs: String,  // Convert int64 to string for BigInt compatibility
      defaults: true
    });

    if (data.fileVersion !== FILE_VERSION) {
      console.log(`!! Storage file ${filename} has an unsupported version -${data.fileVersion}-. Expected -${FILE_VERSION}-`);
      return undefined;
    }

    // Transform the data back to your application format
    return {
      latestResourceTimestamp: Number(data.latestResourceTimestamp),
      latestMarketTimestamp: Number(data.latestMarketTimestamp),
      store: transformFromProtoFormat(data.intervalData)
    };
  } catch (error) {
    console.error(`!! Error loading storage from ${filename}: ${error}`);
    console.timeEnd(`  ResourcePerformance - processResourceData.${resourceName}.${sectionName}.loadStorage`);
    return undefined;
  }
}

// Helper functions to transform data formats
function transformToProtoFormat(data: any): any {
  // Transform your IntervalStore format to proto format
  return {
    resourceStore: transformStore(data.resourceStore),
    trailingAvgStore: transformStore(data.trailingAvgStore),
    indexStore: Object.entries(data.indexStore).reduce((acc, [key, value]) => {
      acc[key] = transformStore(value as any);
      return acc;
    }, {} as any),
    marketStore: Object.entries(data.marketStore).reduce((acc, [key, value]) => {
      acc[key] = transformStore(value as any);
      return acc;
    }, {} as any)
  };
}

function transformStore(store: any): any {
  return {
    data: store.data.map((item: any) => ({
      timestamp: item.timestamp,
      open: item.open.toString(),
      high: item.high.toString(),
      low: item.low.toString(),
      close: item.close.toString()
    })),
    metadata: store.metadata.map((item: any) => ({
      startTimestamp: item.startTimestamp,
      endTimestamp: item.endTimestamp,
      used: item.used.toString(),
      feePaid: item.feePaid.toString()
    })),
    trailingAvgData: store.trailingAvgData.map((item: any) => ({
      timestamp: item.timestamp,
      used: item.used.toString(),
      feePaid: item.feePaid.toString()
    }))
  };
}

function transformFromProtoFormat(data: any): IntervalStore {
  // Transform proto format back to your IntervalStore format
  return Object.entries(data).reduce((acc, [interval, value]: [string, any]) => {
    acc[Number(interval)] = {
      resourceStore: transformFromStore(value.resourceStore),
      trailingAvgStore: transformFromStore(value.trailingAvgStore),
      indexStore: Object.entries(value.indexStore).reduce((store: any, [key, val]) => {
        store[key] = transformFromStore(val as any);
        return store;
      }, {}),
      marketStore: Object.entries(value.marketStore).reduce((store: any, [key, val]) => {
        store[key] = transformFromStore(val as any);
        return store;
      }, {})
    };
    return acc;
  }, {} as IntervalStore);
}

function transformFromStore(store: any): any {
  return {
    data: store.data.map((item: any) => ({
      timestamp: item.timestamp,
      open: BigInt(item.open),
      high: BigInt(item.high),
      low: BigInt(item.low),
      close: BigInt(item.close)
    })),
    metadata: store.metadata.map((item: any) => ({
      startTimestamp: item.startTimestamp,
      endTimestamp: item.endTimestamp,
      used: BigInt(item.used),
      feePaid: BigInt(item.feePaid)
    })),
    trailingAvgData: store.trailingAvgData.map((item: any) => ({
      timestamp: item.timestamp,
      used: BigInt(item.used),
      feePaid: BigInt(item.feePaid)
    }))
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
