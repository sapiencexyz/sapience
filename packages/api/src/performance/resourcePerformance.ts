import { Resource } from 'src/models/Resource';
import {
  epochRepository,
  marketRepository,
  resourcePriceRepository,
} from 'src/db';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { Market } from 'src/models/Market';
import { Epoch } from 'src/models/Epoch';
import { CandleData, StorageData, TrailingAvgData } from './types';
import { MoreThan } from 'typeorm';

import {
  INTERVAL_1_MINUTE,
  INTERVAL_5_MINUTES,
  INTERVAL_15_MINUTES,
  INTERVAL_30_MINUTES,
  INTERVAL_4_HOURS,
  INTERVAL_1_DAY,
  INTERVAL_28_DAYS,
} from './constants';

import {
  loadStorageFromFile,
  maxBigInt,
  minBigInt,
  saveStorageToFile,
} from './helper';

export class ResourcePerformance {
  static readonly MIN_INTERVAL = INTERVAL_5_MINUTES;

  private resource: Resource;
  private markets: Market[];
  private epochs: Epoch[];
  private intervals: number[];
  private trailingAvgTime: number;
  private lastTimestampProcessed: number = 0;

  // Persistent storage. The main storage for the resource performance data and where all the data is pulled when required
  private persistentStorage: StorageData = {};

  // Runtime data. The data that is used to process the resource data on each db pull
  private runtime: {
    dbResourcePrices: ResourcePrice[];
    dbResourcePricesLength: number;
    currentIdx: number;
    processingResourceItems: boolean;
    indexProcessData: {
      [interval: number]: {
        [epochId: string]: {
          used: bigint;
          feePaid: bigint;
          nextTimestamp: number;
        };
      };
    };
    resourceProcessData: {
      [interval: number]: {
        open: bigint;
        high: bigint;
        low: bigint;
        close: bigint;
        nextTimestamp: number;
      };
    };
    trailingAvgProcessData: {
      [interval: number]: {
        used: bigint;
        feePaid: bigint;
        nextTimestamp: number;
        startTimestampIndex: number;
        endTimestampIndex: number;
        endTimestamp: number;
        trailingAvgData: TrailingAvgData[];
      };
    };
  } = {
    dbResourcePrices: [],
    dbResourcePricesLength: 0,
    currentIdx: 0,
    processingResourceItems: false,
    indexProcessData: {},
    resourceProcessData: {},
    trailingAvgProcessData: {},
  };

  constructor(
    resource: Resource,
    intervals: number[] = [
      INTERVAL_1_MINUTE,
      INTERVAL_5_MINUTES,
      INTERVAL_15_MINUTES,
      INTERVAL_30_MINUTES,
      INTERVAL_4_HOURS,
      INTERVAL_1_DAY,
    ],
    trailingAvgTime: number = INTERVAL_28_DAYS
  ) {
    this.resource = resource;
    this.intervals = intervals;
    this.trailingAvgTime = trailingAvgTime;
    this.persistentStorage = {};
    for (const interval of intervals) {
      this.persistentStorage[interval] = {
        resourceStore: {
          data: [],
          metadata: [],
          pointers: {},
          trailingAvgData: [],
        },
        trailingAvgStore: {
          data: [],
          metadata: [],
          pointers: {},
          trailingAvgData: [],
        },
        indexStore: {},
        // marketStore: {},
      };
      this.runtime.resourceProcessData[interval] = {
        open: 0n,
        high: 0n,
        low: 0n,
        close: 0n,
        nextTimestamp: 0,
      };
    }
  }

  async hardInitialize() {
    await this.pullMarketsAndEpochs(false);
    await this.processResourceData();
  }

  async softInitialize() {
    const restoredStorage = await this.restorePersistedStorage();

    if (!restoredStorage) {
      console.log('ResourcePerformance - Storage not found, hard initializing');
      await this.hardInitialize();
      return;
    }

    this.persistentStorage = restoredStorage.store;

    this.lastTimestampProcessed = restoredStorage.latestTimestamp;

    await this.pullMarketsAndEpochs(false);
    await this.processResourceData(this.lastTimestampProcessed);
  }

  private async processResourceData(initialTimestamp?: number) {
    if (this.runtime.processingResourceItems) {
      throw new Error('Resource prices are already being processed');
    }

    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.name} (${initialTimestamp})`
    );

    this.runtime.processingResourceItems = true;

    const dbResourcePrices = await this.pullResourcePrices(initialTimestamp);
    if (dbResourcePrices.length === 0) {
      this.runtime.processingResourceItems = false;
      return;
    }

    await this.pullMarketsAndEpochs();

    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.name}.process`
    );

    this.initializeRuntimeData(dbResourcePrices);

    // Process all resource prices
    while (this.runtime.currentIdx < this.runtime.dbResourcePricesLength) {
      const item = this.runtime.dbResourcePrices[this.runtime.currentIdx];
      for (const interval of this.intervals) {
        this.processResourcePriceData(item, this.runtime.currentIdx, interval);
        this.processTrailingAvgPricesData(
          item,
          this.runtime.currentIdx,
          interval
        );
        this.processIndexPricesData(item, this.runtime.currentIdx, interval);
      }
      this.runtime.currentIdx++;
    }

    // Update the last timestamp processed
    if (this.runtime.dbResourcePricesLength > 0) {
      this.lastTimestampProcessed =
        this.runtime.dbResourcePrices[
          this.runtime.dbResourcePricesLength - 1
        ].timestamp;
    }
    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.name}.process`
    );

    // Save the updated storage to file
    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.name}.persistStorage`
    );
    await this.persistStorage();
    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.name}.persistStorage`
    );

    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.name} (${initialTimestamp})`
    );
    this.runtime.processingResourceItems = false;
  }

  private async pullResourcePrices(initialTimestamp?: number) {
    // Build the query based on whether we have an initialTimestamp
    let whereClause;
    if (initialTimestamp) {
      whereClause = {
        resource: { id: this.resource.id },
        timestamp: MoreThan(initialTimestamp),
      };
    } else {
      whereClause = {
        resource: { id: this.resource.id },
      };
    }

    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.name}.find.resourcePrices`
    );
    const dbResourcePrices = await resourcePriceRepository.find({
      where: whereClause,
      order: {
        timestamp: 'ASC',
      },
    });
    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.name}.find.resourcePrices`
    );

    console.log(
      ` ResourcePerformance.processResourceData.${this.resource.name}.find.resourcePrices.length`,
      dbResourcePrices.length
    );

    return dbResourcePrices;
  }

  private async pullMarketsAndEpochs(onlyIfMissing: boolean = true) {
    // Find markets if not already loaded
    // Notice: doing it everytime since we don't know if a new market was added
    if (!this.markets || this.markets.length === 0 || !onlyIfMissing) {
      console.time(
        ` ResourcePerformance.processResourceData.${this.resource.name}.find.markets`
      );
      this.markets = await marketRepository.find({
        where: {
          resource: { id: this.resource.id },
        },
      });
      console.timeEnd(
        ` ResourcePerformance.processResourceData.${this.resource.name}.find.markets`
      );
    }

    // Find epochs if not already loaded
    // Notice: doing it everytime since we don't know if a new epoch was added
    if (!this.epochs || this.epochs.length === 0 || !onlyIfMissing) {
      console.time(
        ` ResourcePerformance.processResourceData.${this.resource.name}.find.epochs`
      );
      this.epochs = await epochRepository.find({
        where: {
          market: { resource: { id: this.resource.id } },
        },
        order: {
          startTimestamp: 'ASC',
        },
        relations: ['market'],
      });
      console.timeEnd(
        ` ResourcePerformance.processResourceData.${this.resource.name}.find.epochs`
      );
    }
  }

  private initializeRuntimeData(dbResourcePrices: ResourcePrice[]) {
    this.runtime.dbResourcePrices = dbResourcePrices;
    this.runtime.dbResourcePricesLength = dbResourcePrices.length;
    this.runtime.currentIdx = 0;
    this.runtime.processingResourceItems = false;

    // Reset processing data structures
    // We don't need complex initialization anymore since our processing methods
    // will create and update placeholders in-place
    this.runtime.indexProcessData = {};
    this.runtime.resourceProcessData = {};
    this.runtime.trailingAvgProcessData = {};

    // Initialize with empty objects for each interval
    for (const interval of this.intervals) {
      this.runtime.resourceProcessData[interval] = {
        open: 0n,
        high: 0n,
        low: 0n,
        close: 0n,
        nextTimestamp: 0,
      };

      this.runtime.trailingAvgProcessData[interval] = {
        used: 0n,
        feePaid: 0n,
        nextTimestamp: 0,
        startTimestampIndex: 0,
        endTimestampIndex: 0,
        // startTimestamp: 0,
        endTimestamp: 0,
        trailingAvgData: [
          ...this.persistentStorage[interval].trailingAvgStore.trailingAvgData, // Initialize with stored data
        ],
      };

      this.runtime.indexProcessData[interval] = {};

      for (const epoch of this.epochs) {
        this.runtime.indexProcessData[interval][epoch.id] = {
          used: 0n,
          feePaid: 0n,
          nextTimestamp: 0,
        };
      }
    }
  }

  private async persistStorage() {
    const storage = this.persistentStorage;
    const lastTimestampProcessed = this.lastTimestampProcessed;
    const resourceSlug = this.resource.slug;
    const resourceName = this.resource.name;

    for (const interval of this.intervals) {
      // Interval resource store
      await saveStorageToFile(
        storage[interval],
        lastTimestampProcessed,
        resourceSlug,
        resourceName,
        interval.toString()
      );
    }
  }

  private async restorePersistedStorage(): Promise<
    | {
        latestTimestamp: number;
        store: StorageData;
      }
    | undefined
  > {
    const resourceSlug = this.resource.slug;
    const resourceName = this.resource.name;
    const restoredStorage: StorageData = {};
    let latestTimestamp = 0;
    for (const interval of this.intervals) {
      const storageInterval = await loadStorageFromFile(
        resourceSlug,
        resourceName,
        interval.toString()
      );
      if (!storageInterval) {
        return undefined;
      }
      restoredStorage[interval] = storageInterval.store;
      latestTimestamp = storageInterval.latestTimestamp;
      const indexStoreMetadata =
        restoredStorage[interval].indexStore['1'].metadata;
      const lastMetadata = indexStoreMetadata[indexStoreMetadata.length - 1];
      // console.log(
      //   'LLL 12 ',
      //   lastMetadata.used.toString(),
      //   lastMetadata.feePaid.toString(),
      //   lastMetadata.startTimestamp,
      //   lastMetadata.endTimestamp
      // );
    }

    return {
      latestTimestamp,
      store: restoredStorage,
    };
  }

  // async backfillMarketPrices() {
  // }

  // getMarketPrices(from: number, to: number, interval: number) {
  // }

  private processResourcePriceData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    const rpd = this.runtime.resourceProcessData[interval];
    const price =
      BigInt(item.used) > 0n ? BigInt(item.feePaid) / BigInt(item.used) : 0n;

    // If this is the first item or we're starting a new interval
    if (!rpd.nextTimestamp) {
      rpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
      rpd.close = price;

      // Create a placeholder in the store
      const resourceStore = this.persistentStorage[interval].resourceStore;
      const itemStartTime = this.startOfCurrentInterval(
        item.timestamp,
        interval
      );

      // Check if we already have an item for this interval
      const existingIndex = resourceStore.data.findIndex(
        (d) => d.timestamp >= itemStartTime && d.timestamp < rpd.nextTimestamp
      );

      if (existingIndex === -1) {
        // Create a new placeholder
        resourceStore.data.push({
          timestamp: item.timestamp,
          open: price.toString(),
          high: price.toString(),
          low: price.toString(),
          close: price.toString(),
        });

        resourceStore.metadata.push({
          startTimestamp: itemStartTime,
          endTimestamp: rpd.nextTimestamp,
          used: 0n,
          feePaid: 0n,
        });

        resourceStore.pointers[item.timestamp] = resourceStore.data.length - 1;
      }
    }

    // Get the current placeholder index
    const resourceStore = this.persistentStorage[interval].resourceStore;
    const currentPlaceholderIndex = resourceStore.data.length - 1;

    if (
      item.timestamp > rpd.nextTimestamp ||
      currentIdx === this.runtime.dbResourcePricesLength - 1
    ) {
      const isInCurrentInterval = item.timestamp <= rpd.nextTimestamp;
      // Finalize the current interval
      if (currentPlaceholderIndex >= 0) {
        // Update the placeholder with final values
        resourceStore.data[currentPlaceholderIndex] = {
          timestamp: resourceStore.data[currentPlaceholderIndex].timestamp,
          open: rpd.open.toString(),
          high: isInCurrentInterval
            ? maxBigInt(rpd.high, price).toString()
            : rpd.high.toString(),
          low: isInCurrentInterval
            ? minBigInt(rpd.low, price).toString()
            : rpd.low.toString(),
          close: price.toString(),
        };
      }

      // Prepare for next interval
      rpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
      rpd.close = price;

      // Create a placeholder for the next interval
      const itemStartTime = this.startOfCurrentInterval(
        item.timestamp,
        interval
      );

      // Check if we already have an item for this interval
      const existingIndex = resourceStore.data.findIndex(
        (d) => d.timestamp >= itemStartTime && d.timestamp < rpd.nextTimestamp
      );

      if (existingIndex === -1) {
        // Create a new placeholder
        resourceStore.data.push({
          timestamp: item.timestamp,
          open: price.toString(),
          high: price.toString(),
          low: price.toString(),
          close: price.toString(),
        });

        resourceStore.metadata.push({
          startTimestamp: itemStartTime,
          endTimestamp: rpd.nextTimestamp,
          used: 0n,
          feePaid: 0n,
        });

        resourceStore.pointers[item.timestamp] = resourceStore.data.length - 1;
      }
    } else {
      // Update the current interval
      rpd.high = maxBigInt(rpd.high, price);
      rpd.low = minBigInt(rpd.low, price);

      rpd.close = price;

      // Update the placeholder
      if (currentPlaceholderIndex >= 0) {
        resourceStore.data[currentPlaceholderIndex] = {
          timestamp: resourceStore.data[currentPlaceholderIndex].timestamp,
          open: rpd.open.toString(),
          high: rpd.high.toString(),
          low: rpd.low.toString(),
          close: price.toString(),
        };
      }
    }
  }

  private processIndexPricesData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    for (const epoch of this.epochs) {
      const epochStartTime = epoch.startTimestamp;
      const epochEndTime = epoch.endTimestamp;
      // Skip data points that are not in the epoch
      if (
        !epochStartTime ||
        item.timestamp < epochStartTime ||
        (epochEndTime && item.timestamp > epochEndTime)
      ) {
        continue;
      }

      // Runtime data
      const ripd = this.runtime.indexProcessData[interval][epoch.id];

      // If this is the first item or we're starting a new interval
      if (!ripd.nextTimestamp) {
        // console.log('LLL 13 ', item.timestamp, interval);
        ripd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);

        // Initialize index store if needed
        if (!this.persistentStorage[interval].indexStore[epoch.id]) {
          this.persistentStorage[interval].indexStore[epoch.id] = {
            data: [],
            metadata: [],
            pointers: {},
            trailingAvgData: [], // Unused in index store
          };
        }
        const piStore = this.persistentStorage[interval].indexStore[epoch.id];

        // Create a placeholder in the store
        const itemStartTime = this.startOfCurrentInterval(
          item.timestamp,
          interval
        );

        // Check if we already have an item for this interval
        const lastStoreIndex =
          piStore.data.length > 0 ? piStore.data.length - 1 : undefined;
        const isLastStoredItem =
          lastStoreIndex !== undefined
            ? piStore.data[lastStoreIndex].timestamp == itemStartTime
            : false;

        // console.log('LLL 14 ', isLastStoredItem, lastStoreIndex, itemStartTime);

        // const existingIndex = piStore.data.findIndex(
        //   (d) =>
        //     d.timestamp >= itemStartTime && d.timestamp < ripd.nextTimestamp
        // );

        if (isLastStoredItem && lastStoreIndex !== undefined) {
          //   console.log(
          //     'LLL 15 ',
          //     piStore.metadata[lastStoreIndex].used.toString(),
          //   piStore.metadata[lastStoreIndex].feePaid.toString()
          // );
          // // Retrieve history from the store
          const metadata = piStore.metadata[lastStoreIndex];
          ripd.used = metadata.used;
          ripd.feePaid = metadata.feePaid;
          // console.log('LLL 16 ', ripd.used.toString(), ripd.feePaid.toString());
        } else {
          // Create a new placeholder
          piStore.data.push({
            timestamp: itemStartTime,
            open: '0',
            high: '0',
            low: '0',
            close: '0',
          });

          piStore.metadata.push({
            startTimestamp: item.timestamp,
            endTimestamp: item.timestamp,
            used: 0n,
            feePaid: 0n,
          });

          piStore.pointers[item.timestamp] = piStore.data.length - 1;
        }
      }

      // Persistent data
      const piStore = this.persistentStorage[interval].indexStore[epoch.id];

      // Get the current placeholder index (the last item in the store)
      const currentPlaceholderIndex = piStore.data.length - 1;

      // Categorize the current data point
      const isLastItem = currentIdx === this.runtime.dbResourcePricesLength - 1;
      const isNewInterval = item.timestamp > ripd.nextTimestamp;

      // console.log(
      //   'LLL 17 ',
      //   interval,
      //   ripd.used.toString(),
      //   ripd.feePaid.toString(),
      //   item.used.toString(),
      //   item.feePaid.toString()
      // );
      ripd.used += BigInt(item.used);
      ripd.feePaid += BigInt(item.feePaid);
      if (interval == 300) {
        const avgPrice = ripd.used > 0n ? ripd.feePaid / ripd.used : 0n;
        console.log(
          'LLL 18 ',
          interval,
          ripd.used.toString(),
          ripd.feePaid.toString(),
          avgPrice.toString()
        );
      }

      // check if it's the last price item or last in the interval
      if (
        isLastItem ||
        isNewInterval ||
        (epochEndTime && item.timestamp > epochEndTime)
      ) {
        let fixedFeePaid: bigint = BigInt(ripd.feePaid);
        let fixedUsed: bigint = BigInt(ripd.used);

        if (!isNewInterval) {
          // We need to remove the current item from the data since it's not in the current interval
          fixedFeePaid -= BigInt(item.feePaid);
          fixedUsed -= BigInt(item.used);
        }

        // Finalize the current interval
        const avgPrice: bigint = fixedUsed > 0n ? fixedFeePaid / fixedUsed : 0n;

        // Update the placeholder with final values
        piStore.data[currentPlaceholderIndex] = {
          timestamp: piStore.data[currentPlaceholderIndex].timestamp,
          open: avgPrice.toString(),
          high: avgPrice.toString(),
          low: avgPrice.toString(),
          close: avgPrice.toString(),
        };

        piStore.metadata[currentPlaceholderIndex] = {
          startTimestamp:
            piStore.metadata[currentPlaceholderIndex].startTimestamp,
          endTimestamp: item.timestamp,
          used: ripd.used,
          feePaid: ripd.feePaid,
        };

        // Prepare for next interval
        ripd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);

        // Create a placeholder for the next interval
        // Don't create a placeholder if it's the last item, otherwise will be added to the persisted store as empty
        if (!isLastItem) {
          const itemStartTime = this.startOfCurrentInterval(
            item.timestamp,
            interval
          );

          // Check if we already have an item for this interval
          const existingIndex = piStore.data.findIndex(
            (d) => d.timestamp == itemStartTime
          );

          if (existingIndex === -1) {
            // Create a new placeholder
            piStore.data.push({
              timestamp: itemStartTime,
              open: avgPrice.toString(),
              high: avgPrice.toString(),
              low: avgPrice.toString(),
              close: avgPrice.toString(),
            });

            piStore.metadata.push({
              startTimestamp: item.timestamp,
              endTimestamp: ripd.nextTimestamp,
              used: ripd.used,
              feePaid: ripd.feePaid,
            });

            piStore.pointers[item.timestamp] = piStore.data.length - 1;
          }
        }
      }
    }
  }

  /**
   * Process a new data point for a given interval
   *
   * To process a data point for a trailingAvg interval it needs to add the data point value to the accumulators
   * and remove from the accumulators the old values that are outside of the trailing window, for a given interval item.
   *
   * In order to do the removal of old data points, it uses the trailingAvgData array, that contains the data points
   * that are inside the trailing window.
   *
   * To process a data point it needs to identify if the timestamp of the item belongs to a running interval or a new one.
   *
   * If it's a running interval item, it just needs to update the accumulators, and add the datapoint to the trailingAvgData array.
   *
   * If it's a new interval item, it first needs to close the current in progress interval item, store it in the persistent array,
   * and then prepare the next one.
   *
   * There's a special case and is the latest datapoint to process. It needs to update all the persistedData to store and continue
   * processing the next time more data comes from the database.
   *
   * @param item - The current resource price item
   * @param currentIdx - The current index of the resource price item
   * @param interval - The interval of the resource price item
   */
  private processTrailingAvgPricesData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    // Runtime data
    const rtpd = this.runtime.trailingAvgProcessData[interval];
    // console.log('LLL 12 ', rtpd.trailingAvgData.length);

    // Persistent data
    const ptStore = this.persistentStorage[interval].trailingAvgStore;

    // First data point processed in this batch. Initialize accumulators and create a placeholder in the pstore if needed for the this data point
    if (!rtpd.nextTimestamp) {
      // console.log('LLL 1 ', item.timestamp, interval);
      rtpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);

      // Create a placeholder in the store if not found
      const itemStartTime = this.startOfCurrentInterval(
        item.timestamp,
        interval
      );
      // Check if we already have an item for this interval
      const lastStoreIndex =
        ptStore.data.length > 0 ? ptStore.data.length - 1 : undefined;
      const isLastStoredItem =
        lastStoreIndex !== undefined
          ? ptStore.data[lastStoreIndex].timestamp == itemStartTime
          : false;

      // console.log(
      //   'LLL 2 ',
      //   isLastStoredItem,
      //   itemStartTime,
      //   rtpd.nextTimestamp
      // );
      // console.log('LLL 3 ', rtpd.trailingAvgData.length);
      // console.log('LLL 4 ', ptStore.trailingAvgData.length);
      if (isLastStoredItem && lastStoreIndex !== undefined) {
        // Retrieve history from the store
        const metadata = ptStore.metadata[lastStoreIndex];
        rtpd.used = metadata.used;
        rtpd.feePaid = metadata.feePaid;
      } else {
        // Create a new placeholder for the next item. It will be updated once is finished processing the current item
        ptStore.data.push({
          timestamp: itemStartTime,
          open: '0',
          high: '0',
          low: '0',
          close: '0',
        });

        ptStore.metadata.push({
          startTimestamp: item.timestamp,
          endTimestamp: item.timestamp,
          used: 0n,
          feePaid: 0n,
        });

        if (!ptStore.trailingAvgData) {
          // console.log('LLL 10 Initialize trailing avg data');
          ptStore.trailingAvgData = [];
        }

        ptStore.pointers[item.timestamp] = ptStore.data.length - 1;
      }
    }

    // Get the current placeholder index (the last item in the store)
    const currentPlaceholderIndex = ptStore.data.length - 1;

    // Categorize the current data point
    const isLastItem = currentIdx === this.runtime.dbResourcePricesLength - 1;
    const isNewInterval = item.timestamp >= rtpd.nextTimestamp;

    // Include the new item in accumulators and the runtime trailing avg data
    rtpd.used += BigInt(item.used);
    rtpd.feePaid += BigInt(item.feePaid);
    // const previousItemTimestamp = rtpd.trailingAvgData.length > 0 ? rtpd.trailingAvgData[rtpd.trailingAvgData.length - 1].timestamp : item.timestamp;
    rtpd.trailingAvgData.push({
      timestamp: item.timestamp,
      used: item.used,
      feePaid: item.feePaid,
    });

    // Check if the datapoint is the last item or belongs to a new interval item (not running same interval item)
    if (isNewInterval || isLastItem) {
      let fixedFeePaid: bigint = BigInt(rtpd.feePaid);
      let fixedUsed: bigint = BigInt(rtpd.used);

      if (!isNewInterval) {
        // We need to remove the current item from the data since it's not in the current interval
        fixedFeePaid -= BigInt(item.feePaid);
        fixedUsed -= BigInt(item.used);
      }

      // Finalize the current interval
      const price: bigint = fixedUsed > 0n ? fixedFeePaid / fixedUsed : 0n;

      // Update the placeholder with final values
      ptStore.data[currentPlaceholderIndex] = {
        timestamp: ptStore.data[currentPlaceholderIndex].timestamp,
        open: price.toString(),
        high: price.toString(),
        low: price.toString(),
        close: price.toString(),
      };

      ptStore.metadata[currentPlaceholderIndex] = {
        startTimestamp:
          ptStore.metadata[currentPlaceholderIndex].startTimestamp,
        endTimestamp: rtpd.nextTimestamp,
        used: fixedUsed,
        feePaid: fixedFeePaid,
      };

      // Notice: Add the trailing avg data to the metadata, only if it's the last data point
      if (isLastItem) {
        ptStore.trailingAvgData = rtpd.trailingAvgData.slice(
          rtpd.startTimestampIndex,
          currentIdx
        );
      }

      // If not the last item, prepare for next interval
      if (!isLastItem) {
        rtpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);

        // Create a placeholder for the next interval
        const itemStartTime = this.startOfCurrentInterval(
          item.timestamp,
          interval
        );

        // Check if we already have an item for this interval
        const existingIndex = ptStore.data.findIndex(
          (d) => d.timestamp == itemStartTime
        );

        if (existingIndex === -1) {
          // Create a new placeholder
          ptStore.data.push({
            timestamp: itemStartTime,
            open: price.toString(),
            high: price.toString(),
            low: price.toString(),
            close: price.toString(),
          });

          ptStore.metadata.push({
            startTimestamp: item.timestamp,
            endTimestamp: rtpd.nextTimestamp,
            used: rtpd.used,
            feePaid: rtpd.feePaid,
          });

          ptStore.pointers[item.timestamp] = ptStore.data.length - 1;
        }
      }
    }

    // Remove the old items from the trailing avg if they are before the trailing avg timestamp
    let startIdx = rtpd.startTimestampIndex;
    let oldItem = rtpd.trailingAvgData[startIdx];
    // TODO Check if is item.timestamp - this.trailingAvgTime or rtpd.nextTimestamp - this.trailingAvgTime
    const trailingAvgTimestamp = item.timestamp - this.trailingAvgTime;
    const lastIdx = rtpd.trailingAvgData.length - 1;

    // console.log('LLL 11 ', oldItem.timestamp < trailingAvgTimestamp, item.timestamp, oldItem.timestamp,trailingAvgTimestamp, rtpd.trailingAvgData.length);

    while (oldItem.timestamp < trailingAvgTimestamp) {
      rtpd.used -= BigInt(oldItem.used);
      rtpd.feePaid -= BigInt(oldItem.feePaid);
      startIdx++;
      rtpd.startTimestampIndex = startIdx;
      if (startIdx >= lastIdx) break; // no more items to remove
      oldItem = rtpd.trailingAvgData[startIdx];
    }
  }

  private getEpochId(chainId: number, address: string, epoch: string) {
    const theEpoch = this.epochs.find(
      (e) =>
        e.market.chainId === chainId &&
        e.market.address === address &&
        e.epochId === Number(epoch)
    );
    if (!theEpoch) {
      throw new Error(`Epoch not found for ${chainId}-${address}-${epoch}`);
    }

    return theEpoch.id;
  }

  getResourcePrices(from: number, to: number, interval: number) {
    this.checkInterval(interval);

    return this.getPricesFromArray(
      this.persistentStorage[interval].resourceStore.data,
      from,
      to,
      interval
    );
  }

  getIndexPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    epoch: string
  ) {
    this.checkInterval(interval);
    const epochId = this.getEpochId(chainId, address, epoch);
    if (!this.persistentStorage[interval].indexStore[epochId]) {
      return [];
    }
    return this.getPricesFromArray(
      this.persistentStorage[interval].indexStore[epochId].data,
      from,
      to,
      interval,
      false
    );
  }

  getTrailingAvgPrices(from: number, to: number, interval: number) {
    this.checkInterval(interval);
    return this.getPricesFromArray(
      this.persistentStorage[interval].trailingAvgStore.data,
      from,
      to,
      interval
    );
  }

  getMarketFromChainAndAddress(chainId: number, address: string) {
    return this.markets.find(
      (m) =>
        m.chainId === chainId &&
        m.address.toLowerCase() === address.toLowerCase()
    );
  }

  private checkInterval(interval: number) {
    if (!this.intervals.includes(interval)) {
      throw new Error(
        `Invalid interval: ${interval}. Must be one of: ${this.intervals.join(', ')}`
      );
    }
  }

  private async updateStoreIfNeeded(prices: CandleData[], to: number) {
    // Get the last processed interval's end timestamp
    if (!prices?.length) {
      return;
    }

    const lastProcessedData = prices[prices.length - 1];

    // If the requested 'to' timestamp is beyond our last processed interval
    if (to > lastProcessedData.timestamp) {
      // Process new data starting from the last timestamp we processed
      await this.processResourceData(this.lastTimestampProcessed);
    }
  }

  private async getPricesFromArray(
    prices: CandleData[],
    from: number,
    to: number,
    interval: number,
    fillMissing: boolean = true
  ) {
    if (prices.length === 0) {
      return [];
    }

    const timeWindow: {
      from: number;
      to: number;
    } = {
      from: this.startOfCurrentInterval(from, interval),
      to: this.startOfCurrentInterval(to, interval),
    };

    // Check if we need to process new data for this requested time range
    await this.updateStoreIfNeeded(prices, timeWindow.to);

    // If there are no prices or window starts before first price, add zero entries
    if (fillMissing && timeWindow.from < prices[0].timestamp) {
      const zeroEntries = [];
      for (let t = timeWindow.from; t < prices[0].timestamp; t += interval) {
        zeroEntries.push({
          timestamp: t,
          open: '0',
          high: '0',
          low: '0',
          close: '0',
        });
      }
      prices = [...zeroEntries, ...prices];
    }

    // TODO: Use pointer to find the start and end indices
    // Since prices are ordered by timestamp, we can find the start and end indices
    let startIndex = prices.findIndex(
      (price) => price.timestamp >= timeWindow.from
    );
    if (startIndex === -1) startIndex = prices.length;

    let endIndex = prices.length;
    for (let i = startIndex; i < prices.length; i++) {
      if (prices[i].timestamp > timeWindow.to) {
        endIndex = i;
        break;
      }
    }

    // Get slice of prices in time window
    const pricesInRange = prices.slice(startIndex, endIndex);
    return pricesInRange.map((price) => ({
      timestamp: price.timestamp,
      open: price.open.toString(),
      high: price.high.toString(),
      low: price.low.toString(),
      close: price.close.toString(),
    }));
  }

  startOfCurrentInterval(
    timestamp: number,
    interval: number | undefined = undefined
  ) {
    if (interval === undefined) {
      interval = ResourcePerformance.MIN_INTERVAL;
    }
    return Math.floor(timestamp / interval) * interval;
  }

  startOfNextInterval(
    timestamp: number,
    interval: number | undefined = undefined
  ) {
    if (interval === undefined) {
      interval = ResourcePerformance.MIN_INTERVAL;
    }
    return (Math.floor(timestamp / interval) + 1) * interval;
  }
}
