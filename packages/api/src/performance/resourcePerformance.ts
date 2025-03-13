import { Resource } from 'src/models/Resource';
import {
  epochRepository,
  marketPriceRepository,
  marketRepository,
  resourcePriceRepository,
} from 'src/db';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { Market } from 'src/models/Market';
import { Epoch } from 'src/models/Epoch';
import {
  CandleData,
  MarketPriceData,
  StorageData,
  TrailingAvgData,
} from './types';
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
  private lastResourceTimestampProcessed: number = 0;
  private lastMarketTimestampProcessed: number = 0;

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
    marketProcessData: {
      [interval: number]: {
        [epochId: string]: {
          open: bigint;
          high: bigint;
          low: bigint;
          close: bigint;
          nextTimestamp: number;
        };
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
    marketProcessData: {},
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
        marketStore: {},
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

    this.lastResourceTimestampProcessed =
      restoredStorage.latestResourceTimestamp;
    this.lastMarketTimestampProcessed = restoredStorage.latestMarketTimestamp;

    await this.pullMarketsAndEpochs(false);
    await this.processResourceData(
      this.lastResourceTimestampProcessed,
      this.lastMarketTimestampProcessed
    );
  }

  private async processResourceData(
    initialResourceTimestamp?: number,
    initialMarketTimestamp?: number
  ) {
    if (this.runtime.processingResourceItems) {
      throw new Error('Resource prices are already being processed');
    }

    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.total (${initialResourceTimestamp})`
    );

    this.runtime.processingResourceItems = true;

    const dbResourcePrices = await this.pullResourcePrices(
      initialResourceTimestamp
    );
    const dbMarketPrices = await this.pullMarketPrices(initialMarketTimestamp);

    if (dbResourcePrices.length === 0 && dbMarketPrices.length === 0) {
      console.timeEnd(
        ` ResourcePerformance.processResourceData.${this.resource.slug}.total (${initialResourceTimestamp})`
      );
      this.runtime.processingResourceItems = false;
      return;
    }

    await this.pullMarketsAndEpochs();

    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.process`
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

    // Process all market prices
    let marketIdx = 0;
    const dbMarketPricesLength = dbMarketPrices.length;
    while (marketIdx < dbMarketPricesLength) {
      const item = dbMarketPrices[marketIdx];
      for (const interval of this.intervals) {
        this.processMarketPriceData(
          item,
          marketIdx,
          interval,
          dbMarketPricesLength === marketIdx + 1
        );
      }
      marketIdx++;
    }

    // Update the last timestamp processed
    if (this.runtime.dbResourcePricesLength > 0) {
      this.lastResourceTimestampProcessed =
        this.runtime.dbResourcePrices[
          this.runtime.dbResourcePricesLength - 1
        ].timestamp;
    }

    if (dbMarketPricesLength > 0) {
      this.lastMarketTimestampProcessed =
        dbMarketPrices[dbMarketPricesLength - 1].timestamp;
    }

    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.process`
    );

    // Save the updated storage to file
    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.persistStorage`
    );
    await this.persistStorage();
    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.persistStorage`
    );

    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.total (${initialResourceTimestamp})`
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
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.resourcePrices`
    );
    const dbResourcePrices = await resourcePriceRepository.find({
      where: whereClause,
      order: {
        timestamp: 'ASC',
      },
    });
    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.resourcePrices`
    );

    console.log(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.resourcePrices.length`,
      dbResourcePrices.length
    );

    return dbResourcePrices;
  }

  private async pullMarketPrices(initialTimestamp?: number) {
    // Build the query based on whether we have an initialTimestamp
    console.time(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.marketPrices`
    );

    const dbMarketPrices = await marketPriceRepository
      .createQueryBuilder('marketPrice')
      .leftJoinAndSelect('marketPrice.transaction', 'transaction')
      .leftJoinAndSelect('transaction.event', 'event')
      .leftJoinAndSelect('event.market', 'market')
      .leftJoinAndSelect('market.resource', 'resource')
      .leftJoinAndSelect('transaction.position', 'position')
      .leftJoinAndSelect('position.epoch', 'epoch')
      .where('resource.id = :resourceId', { resourceId: this.resource.id })
      .andWhere('CAST(marketPrice.timestamp AS bigint) > :from', {
        from: initialTimestamp?.toString() ?? '0',
      })
      .orderBy('marketPrice.timestamp', 'ASC')
      .getMany();

    const reducedDbMarketPrices = dbMarketPrices.map((item) => ({
      value: item.value,
      timestamp: Number(item.timestamp),
      epoch: item.transaction.position.epoch.id,
    }));

    console.timeEnd(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.marketPrices`
    );

    console.log(
      ` ResourcePerformance.processResourceData.${this.resource.slug}.find.marketPrices.length`,
      dbMarketPrices.length
    );

    return reducedDbMarketPrices;
  }

  private async pullMarketsAndEpochs(onlyIfMissing: boolean = true) {
    // Find markets if not already loaded
    // Notice: doing it everytime since we don't know if a new market was added
    if (!this.markets || this.markets.length === 0 || !onlyIfMissing) {
      console.time(
        ` ResourcePerformance.processResourceData.${this.resource.slug}.find.markets`
      );
      this.markets = await marketRepository.find({
        where: {
          resource: { id: this.resource.id },
        },
      });
      console.timeEnd(
        ` ResourcePerformance.processResourceData.${this.resource.slug}.find.markets`
      );
    }

    // Find epochs if not already loaded
    // Notice: doing it everytime since we don't know if a new epoch was added
    if (!this.epochs || this.epochs.length === 0 || !onlyIfMissing) {
      console.time(
        ` ResourcePerformance.processResourceData.${this.resource.slug}.find.epochs`
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
        ` ResourcePerformance.processResourceData.${this.resource.slug}.find.epochs`
      );
    }
  }

  private initializeRuntimeData(dbResourcePrices: ResourcePrice[]) {
    this.runtime.dbResourcePrices = dbResourcePrices;
    this.runtime.dbResourcePricesLength = dbResourcePrices.length;
    this.runtime.currentIdx = 0;

    // Reset processing data structures
    // We don't need complex initialization anymore since our processing methods
    // will create and update placeholders in-place
    this.runtime.indexProcessData = {};
    this.runtime.resourceProcessData = {};
    this.runtime.trailingAvgProcessData = {};
    this.runtime.marketProcessData = {};

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
      this.runtime.marketProcessData[interval] = {};

      for (const epoch of this.epochs) {
        this.runtime.indexProcessData[interval][epoch.id] = {
          used: 0n,
          feePaid: 0n,
          nextTimestamp: 0,
        };
        this.runtime.marketProcessData[interval][epoch.id] = {
          open: 0n,
          high: 0n,
          low: 0n,
          close: 0n,
          nextTimestamp: 0,
        };
      }
    }
  }

  private async persistStorage() {
    const storage = this.persistentStorage;
    const lastResourceTimestampProcessed = this.lastResourceTimestampProcessed;
    const lastMarketTimestampProcessed = this.lastMarketTimestampProcessed;
    const resourceSlug = this.resource.slug;
    const resourceName = this.resource.name;

    for (const interval of this.intervals) {
      // Interval resource store
      await saveStorageToFile(
        storage[interval],
        lastResourceTimestampProcessed,
        lastMarketTimestampProcessed,
        resourceSlug,
        resourceName,
        interval.toString()
      );
    }
  }

  private async restorePersistedStorage(): Promise<
    | {
        latestResourceTimestamp: number;
        latestMarketTimestamp: number;
        store: StorageData;
      }
    | undefined
  > {
    const resourceSlug = this.resource.slug;
    const resourceName = this.resource.name;
    const restoredStorage: StorageData = {};
    let latestResourceTimestamp = 0;
    let latestMarketTimestamp = 0;
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
      latestResourceTimestamp = storageInterval.latestResourceTimestamp;
      latestMarketTimestamp = storageInterval.latestMarketTimestamp;
    }

    return {
      latestResourceTimestamp,
      latestMarketTimestamp,
      store: restoredStorage,
    };
  }

  private processResourcePriceData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    const rpd = this.runtime.resourceProcessData[interval];
    const price = BigInt(item.value);

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

        // Get cached data from the latest stored item
        if (lastStoreIndex !== undefined) {
          const metadata = piStore.metadata[lastStoreIndex];
          ripd.used = metadata.used;
          ripd.feePaid = metadata.feePaid;
        }

        const isLastStoredItem =
          lastStoreIndex !== undefined
            ? piStore.data[lastStoreIndex].timestamp == itemStartTime
            : false;

        if (!isLastStoredItem) {
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
            used: ripd.used,
            feePaid: ripd.feePaid,
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
      const isNewInterval = item.timestamp >= ripd.nextTimestamp;

      ripd.used += BigInt(item.used);
      ripd.feePaid += BigInt(item.feePaid);

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

        // Prepare and create a placeholder for the next interval if there's a new interval
        if (isNewInterval) {
          ripd.nextTimestamp = this.startOfNextInterval(
            item.timestamp,
            interval
          );

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

    // Persistent data
    const ptStore = this.persistentStorage[interval].trailingAvgStore;

    // First data point processed in this batch. Initialize accumulators and create a placeholder in the pstore if needed for the this data point
    if (!rtpd.nextTimestamp) {
      rtpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);

      // Create a placeholder in the store if not found
      const itemStartTime = this.startOfCurrentInterval(
        item.timestamp,
        interval
      );

      // Check if we already have an item for this interval
      const lastStoreIndex =
        ptStore.data.length > 0 ? ptStore.data.length - 1 : undefined;

      // Get cached data from the latest stored item
      if (lastStoreIndex !== undefined) {
        const metadata = ptStore.metadata[lastStoreIndex];
        rtpd.used = metadata.used;
        rtpd.feePaid = metadata.feePaid;
      }

      // Check if we already have an item for this interval
      const isLastStoredItem =
        lastStoreIndex !== undefined
          ? ptStore.data[lastStoreIndex].timestamp == itemStartTime
          : false;

      if (!isLastStoredItem) {
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
          used: rtpd.used,
          feePaid: rtpd.feePaid,
        });

        if (!ptStore.trailingAvgData) {
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
      const avgPrice: bigint = fixedUsed > 0n ? fixedFeePaid / fixedUsed : 0n;

      // Update the placeholder with final values
      ptStore.data[currentPlaceholderIndex] = {
        timestamp: ptStore.data[currentPlaceholderIndex].timestamp,
        open: avgPrice.toString(),
        high: avgPrice.toString(),
        low: avgPrice.toString(),
        close: avgPrice.toString(),
      };

      ptStore.metadata[currentPlaceholderIndex] = {
        startTimestamp:
          ptStore.metadata[currentPlaceholderIndex].startTimestamp,
        endTimestamp: item.timestamp,
        used: rtpd.used,
        feePaid: rtpd.feePaid,
      };

      // Notice: Add the trailing avg data to the metadata, only if it's the last data point
      if (isLastItem) {
        ptStore.trailingAvgData = rtpd.trailingAvgData.slice(
          rtpd.startTimestampIndex,
          currentIdx
        );
      }

      // Prepare and create a placeholder for the next interval if there's a new interval
      if (isNewInterval) {
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
            open: avgPrice.toString(),
            high: avgPrice.toString(),
            low: avgPrice.toString(),
            close: avgPrice.toString(),
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

    while (oldItem.timestamp < trailingAvgTimestamp) {
      rtpd.used -= BigInt(oldItem.used);
      rtpd.feePaid -= BigInt(oldItem.feePaid);
      startIdx++;
      rtpd.startTimestampIndex = startIdx;
      if (startIdx >= lastIdx) break; // no more items to remove
      oldItem = rtpd.trailingAvgData[startIdx];
    }
  }

  private processMarketPriceData(
    item: MarketPriceData,
    currentIdx: number,
    interval: number,
    isLastItem: boolean
  ) {
    for (const epoch of this.epochs) {
      if (epoch.id != item.epoch) {
        continue;
      }

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
      const itemValueBn = BigInt(item.value);

      const rmpd = this.runtime.marketProcessData[interval][epoch.id];

      if (!rmpd.nextTimestamp) {
        rmpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);
        rmpd.open = itemValueBn;
        rmpd.high = itemValueBn;
        rmpd.low = itemValueBn;
        rmpd.close = itemValueBn;

        if (!this.persistentStorage[interval].marketStore[epoch.id]) {
          this.persistentStorage[interval].marketStore[epoch.id] = {
            data: [],
            metadata: [],
            pointers: {},
            trailingAvgData: [],
          };
        }

        const pmStore = this.persistentStorage[interval].marketStore[epoch.id];

        // Create a placeholder in the store
        const itemStartTime = this.startOfCurrentInterval(
          item.timestamp,
          interval
        );

        // Check if we already have an item for this interval
        const lastStoreIndex =
          pmStore.data.length > 0 ? pmStore.data.length - 1 : undefined;

        // Get cached data from the latest stored item
        if (lastStoreIndex !== undefined) {
          const previousData = pmStore.data[lastStoreIndex];
          rmpd.open = BigInt(previousData.open);
          rmpd.high = BigInt(previousData.high);
          rmpd.low = BigInt(previousData.low);
          rmpd.close = BigInt(previousData.close);
        }

        const isLastStoredItem =
          lastStoreIndex !== undefined
            ? pmStore.data[lastStoreIndex].timestamp == itemStartTime
            : false;

        if (!isLastStoredItem) {
          pmStore.data.push({
            timestamp: itemStartTime,
            open: rmpd.close.toString(), // open is the previous close
            high: maxBigInt(rmpd.high, itemValueBn).toString(),
            low: minBigInt(rmpd.low, itemValueBn).toString(),
            close: itemValueBn.toString(),
          });

          pmStore.pointers[item.timestamp] = pmStore.data.length - 1;
        }
      }

      // Get the current placeholder index (the last item in the store)
      const pmStore = this.persistentStorage[interval].marketStore[epoch.id];
      const currentPlaceholderIndex = pmStore.data.length - 1;

      const isNewInterval = item.timestamp >= rmpd.nextTimestamp;
      const isEndOfEpoch = epochEndTime && item.timestamp > epochEndTime;

      rmpd.open = rmpd.open === 0n ? itemValueBn : rmpd.open;
      if (isNewInterval || isLastItem || isEndOfEpoch) {
        // Finalize the current interval
        pmStore.data[currentPlaceholderIndex] = {
          timestamp: pmStore.data[currentPlaceholderIndex].timestamp,
          open: rmpd.open.toString(),
          high: maxBigInt(rmpd.high, itemValueBn).toString(),
          low: minBigInt(rmpd.low, itemValueBn).toString(),
          close: itemValueBn.toString(),
        };
        // Prepare the next interval
        rmpd.nextTimestamp = this.startOfNextInterval(item.timestamp, interval);
        rmpd.open = itemValueBn;
        rmpd.high = itemValueBn;
        rmpd.low = itemValueBn;
        rmpd.close = itemValueBn;

        // Create a placeholder for the next interval
        const itemStartTime = this.startOfCurrentInterval(
          item.timestamp,
          interval
        );

        // Check if we already have an item for this interval
        const existingIndex = pmStore.data.findIndex(
          (d) =>
            d.timestamp >= itemStartTime && d.timestamp < rmpd.nextTimestamp
        );

        if (existingIndex === -1 && !isEndOfEpoch) {
          // Create a new placeholder
          pmStore.data.push({
            timestamp: itemStartTime,
            open: item.value,
            high: item.value,
            low: item.value,
            close: item.value,
          });

          pmStore.pointers[item.timestamp] = pmStore.data.length - 1;
        }
      } else {
        // Update the current interval min/max values
        rmpd.high = maxBigInt(rmpd.high, itemValueBn);
        rmpd.low = minBigInt(rmpd.low, itemValueBn);
        rmpd.close = itemValueBn;
      }
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

  async getMarketPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    epoch: string
  ) {
    this.checkInterval(interval);
    const epochId = this.getEpochId(chainId, address, epoch);
    if (!this.persistentStorage[interval].marketStore[epochId]) {
      return [];
    }

    const prices = await this.getPricesFromArray(
      this.persistentStorage[interval].marketStore[epochId].data,
      from,
      to,
      interval,
      false
    );

    const filledPrices = this.fillMissingCandles(prices, from, to, interval);

    return filledPrices;
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
      if (this.runtime.processingResourceItems) {
        // There's an update already running, don't call it again
        console.log(
          `ResourcePerformance - Update already running for ${this.resource.slug} to ${to}`
        );
      } else {
        // Process new data starting from the last timestamp we processed
        await this.processResourceData(
          this.lastResourceTimestampProcessed,
          this.lastMarketTimestampProcessed
        );
      }
    }
  }

  private async getPricesFromArray(
    prices: CandleData[],
    from: number,
    to: number,
    interval: number,
    fillInitialDatapoints: boolean = true
  ) {
    if (prices.length === 0) {
      return [];
    }

    const timeWindow = this.getTimeWindow(from, to, interval);

    // Check if we need to process new data for this requested time range
    await this.updateStoreIfNeeded(prices, timeWindow.to);

    // If there are no prices or window starts before first price, add zero entries
    if (fillInitialDatapoints && timeWindow.from < prices[0].timestamp) {
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

  private fillMissingCandles(
    prices: CandleData[],
    from: number,
    to: number,
    interval: number
  ) {
    const timeWindow = this.getTimeWindow(from, to, interval);

    const outputEntries = [];
    for (let t = timeWindow.from; t < timeWindow.to; t += interval) {
      outputEntries.push({
        timestamp: t,
        open: '0',
        high: '0',
        low: '0',
        close: '0',
      });
    }
    let outputIdx = 0;
    let pricesIdx = 0;
    let lastClose = '0';
    const pricesLength = prices.length;
    if (pricesLength === 0) {
      return outputEntries;
    }

    let nextPriceItemTimestamp = prices[pricesIdx].timestamp;

    while (outputIdx < outputEntries.length) {
      if (outputEntries[outputIdx].timestamp < nextPriceItemTimestamp) {
        outputEntries[outputIdx].close = lastClose;
        outputEntries[outputIdx].high = lastClose;
        outputEntries[outputIdx].low = lastClose;
        outputEntries[outputIdx].open = lastClose;

        outputIdx++;
        continue;
      }

      if (outputEntries[outputIdx].timestamp == nextPriceItemTimestamp) {
        outputEntries[outputIdx] = prices[pricesIdx];
        lastClose = prices[pricesIdx].close;
        pricesIdx++;
        nextPriceItemTimestamp =
          pricesIdx < pricesLength
            ? prices[pricesIdx].timestamp
            : timeWindow.to + 1; // set it in the future if not more prices to fall in the first if for the next loops

        outputIdx++;
        continue;
      }

      if (outputEntries[outputIdx].timestamp > nextPriceItemTimestamp) {
        // pick the last known price first
        let lastKnownPrice = prices[pricesIdx].close;

        // then move the prices  the price in the prices array
        while (
          nextPriceItemTimestamp < outputEntries[outputIdx].timestamp ||
          pricesIdx < pricesLength
        ) {
          nextPriceItemTimestamp = prices[pricesIdx].timestamp;
          lastKnownPrice = prices[pricesIdx].close;
          pricesIdx++;
        }

        if (nextPriceItemTimestamp === outputEntries[outputIdx].timestamp) {
          outputEntries[outputIdx] = prices[pricesIdx];
        } else {
          outputEntries[outputIdx].close = lastKnownPrice;
          outputEntries[outputIdx].high = lastKnownPrice;
          outputEntries[outputIdx].low = lastKnownPrice;
          outputEntries[outputIdx].open = lastKnownPrice;
        }

        outputIdx++;
      }
    }

    return outputEntries;
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

  private getTimeWindow(from: number, to: number, interval: number) {
    return {
      from: this.startOfCurrentInterval(from, interval),
      to: this.startOfCurrentInterval(to, interval),
    };
  }
}
