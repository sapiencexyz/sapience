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

  private storage: StorageData = {};

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
        startTimestamp: number;
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
    this.storage = {};
    for (const interval of intervals) {
      this.storage[interval] = {
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
    await this.processResourceData();
  }

  async softInitialize() {
    const storage = await this.restorePersistedStorage();

    if (!storage) {
      console.log('Storage not found, hard initializing');
      await this.hardInitialize();
      return;
    }

    this.storage = storage.store;

    this.lastTimestampProcessed = storage.latestTimestamp;

    await this.processResourceData(this.lastTimestampProcessed);
  }

  private async processResourceData(initialTimestamp?: number) {
    console.time(
      ` processResourceData.${this.resource.name} (${initialTimestamp})`
    );

    if (this.runtime.processingResourceItems) {
      throw new Error('Resource prices are already being processed');
    }

    this.runtime.processingResourceItems = true;

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
      ` processResourceData.${this.resource.name}.find.resourcePrices`
    );
    const dbResourcePrices = await resourcePriceRepository.find({
      where: whereClause,
      order: {
        timestamp: 'ASC',
      },
    });
    console.timeEnd(
      ` processResourceData.${this.resource.name}.find.resourcePrices`
    );

    console.log(
      ` processResourceData.${this.resource.name}.find.resourcePrices.length`,
      dbResourcePrices.length
    );

    if (dbResourcePrices.length === 0) {
      this.runtime.processingResourceItems = false;
      return;
    }

    // Find markets if not already loaded
    // Notice: doing it everytime since we don't know if a new market was added
    // if (!this.markets || this.markets.length === 0) {
    console.time(` processResourceData.${this.resource.name}.find.markets`);
    this.markets = await marketRepository.find({
      where: {
        resource: { id: this.resource.id },
      },
    });
    console.timeEnd(` processResourceData.${this.resource.name}.find.markets`);
    // }

    // Find epochs if not already loaded
    // Notice: doing it everytime since we don't know if a new epoch was added
    // if (!this.epochs || this.epochs.length === 0) {
    console.time(` processResourceData.${this.resource.name}.find.epochs`);
    this.epochs = await epochRepository.find({
      where: {
        market: { resource: { id: this.resource.id } },
      },
      order: {
        startTimestamp: 'ASC',
      },
      relations: ['market'],
    });
    console.timeEnd(` processResourceData.${this.resource.name}.find.epochs`);
    // }

    console.time(` processResourceData.${this.resource.name}.process`);
    // Set up runtime data
    this.runtime.dbResourcePricesLength = dbResourcePrices.length;
    this.runtime.dbResourcePrices = dbResourcePrices;
    this.runtime.currentIdx = 0;

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
        startTimestamp: 0,
        endTimestamp: 0,
        trailingAvgData: [
          ...this.storage[interval].trailingAvgStore.trailingAvgData, // LLL TODO Initialize with stored data
        ],
      };

      this.runtime.indexProcessData[interval] = {};
    }

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
    console.timeEnd(` processResourceData.${this.resource.name}.process`);

    // Save the updated storage to file
    console.time(` processResourceData.${this.resource.name}.persistStorage`);
    await this.persistStorage();
    console.timeEnd(
      ` processResourceData.${this.resource.name}.persistStorage`
    );

    console.timeEnd(
      ` processResourceData.${this.resource.name} (${initialTimestamp})`
    );
    this.runtime.processingResourceItems = false;
  }

  private async persistStorage() {
    const storage = this.storage;
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
    const storage: StorageData = {};
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
      storage[interval] = storageInterval.store;
      latestTimestamp = storageInterval.latestTimestamp;
    }

    return {
      latestTimestamp,
      store: storage,
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
      rpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
      rpd.close = price;

      // Create a placeholder in the store
      const resourceStore = this.storage[interval].resourceStore;
      const itemStartTime = this.snapToInterval(item.timestamp, interval);

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
    const resourceStore = this.storage[interval].resourceStore;
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
      rpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
      rpd.close = price;

      // Create a placeholder for the next interval
      const itemStartTime = this.snapToInterval(item.timestamp, interval);

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
      if (
        !epochStartTime ||
        item.timestamp < epochStartTime ||
        (epochEndTime && item.timestamp > epochEndTime)
      ) {
        continue;
      }

      if (!this.runtime.indexProcessData[interval][epoch.id]) {
        this.runtime.indexProcessData[interval][epoch.id] = {
          used: 0n,
          feePaid: 0n,
          nextTimestamp: 0,
        };
      }

      const ipd = this.runtime.indexProcessData[interval][epoch.id];

      // If this is the first item or we're starting a new interval
      if (!ipd.nextTimestamp) {
        ipd.nextTimestamp = this.nextInterval(item.timestamp, interval);
        ipd.used = BigInt(item.used);
        ipd.feePaid = BigInt(item.feePaid);

        // Initialize index store if needed
        if (!this.storage[interval].indexStore[epoch.id]) {
          this.storage[interval].indexStore[epoch.id] = {
            data: [],
            metadata: [],
            pointers: {},
            trailingAvgData: [], // Unused in index store
          };
        }

        // Create a placeholder in the store
        const indexStore = this.storage[interval].indexStore[epoch.id];
        const itemStartTime = this.snapToInterval(item.timestamp, interval);
        const avgPrice = ipd.used > 0n ? ipd.feePaid / ipd.used : 0n;

        // Check if we already have an item for this interval
        const existingIndex = indexStore.data.findIndex(
          (d) => d.timestamp >= itemStartTime && d.timestamp < ipd.nextTimestamp
        );

        if (existingIndex === -1) {
          // Create a new placeholder
          indexStore.data.push({
            timestamp: item.timestamp,
            open: avgPrice.toString(),
            high: avgPrice.toString(),
            low: avgPrice.toString(),
            close: avgPrice.toString(),
          });

          indexStore.metadata.push({
            used: ipd.used,
            feePaid: ipd.feePaid,
            startTimestamp: epochStartTime,
            endTimestamp: item.timestamp,
          });

          indexStore.pointers[item.timestamp] = indexStore.data.length - 1;
        }
      }

      // Get the current placeholder index
      const indexStore = this.storage[interval].indexStore[epoch.id];
      const currentPlaceholderIndex = indexStore.data.length - 1;

      const isLastItem = currentIdx === this.runtime.dbResourcePricesLength - 1;
      const isNewInterval = item.timestamp > ipd.nextTimestamp;

      // check if it's the last price item or last in the interval
      if (
        isLastItem ||
        isNewInterval ||
        (epochEndTime && item.timestamp > epochEndTime)
      ) {
        // Still in current interval means end of items or end of epoch. We need to use the current values and close the interval
        if (!isNewInterval) {
          ipd.used += BigInt(item.used);
          ipd.feePaid += BigInt(item.feePaid);
        }

        // Finalize the current interval
        const avgPrice = ipd.used > 0n ? ipd.feePaid / ipd.used : 0n;

        if (currentPlaceholderIndex >= 0) {
          // Update the placeholder with final values
          indexStore.data[currentPlaceholderIndex] = {
            timestamp: indexStore.data[currentPlaceholderIndex].timestamp,
            open: avgPrice.toString(),
            high: avgPrice.toString(),
            low: avgPrice.toString(),
            close: avgPrice.toString(),
          };

          indexStore.metadata[currentPlaceholderIndex] = {
            used: ipd.used,
            feePaid: ipd.feePaid,
            startTimestamp: epochStartTime,
            endTimestamp: item.timestamp,
          };
        }

        // Prepare for next interval
        ipd.nextTimestamp = this.nextInterval(item.timestamp, interval);

        // Create a placeholder for the next interval
        const itemStartTime = this.snapToInterval(item.timestamp, interval);

        // Check if we already have an item for this interval
        const existingIndex = indexStore.data.findIndex(
          (d) => d.timestamp >= itemStartTime && d.timestamp < ipd.nextTimestamp
        );

        if (existingIndex === -1) {
          // Create a new placeholder
          indexStore.data.push({
            timestamp: item.timestamp,
            open: '0',
            high: '0',
            low: '0',
            close: '0',
          });

          indexStore.metadata.push({
            used: 0n,
            feePaid: 0n,
            startTimestamp: epochStartTime,
            endTimestamp: item.timestamp,
          });

          indexStore.pointers[item.timestamp] = indexStore.data.length - 1;
        }
      }

      // Always update the accumulated values
      ipd.used += BigInt(item.used);
      ipd.feePaid += BigInt(item.feePaid);
    }
  }

  private processTrailingAvgPricesData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    const tpd = this.runtime.trailingAvgProcessData[interval];

    // If this is the first item or we're starting a new interval
    if (!tpd.nextTimestamp) {
      tpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      tpd.used = BigInt(item.used);
      tpd.feePaid = BigInt(item.feePaid);
      tpd.startTimestamp = item.timestamp;
      tpd.endTimestamp = item.timestamp;
      tpd.startTimestampIndex = 0;
      tpd.endTimestampIndex = currentIdx;

      // Create a placeholder in the store if not found
      const trailingAvgStore = this.storage[interval].trailingAvgStore;
      const itemStartTime = this.snapToInterval(item.timestamp, interval);
      const price = tpd.used > 0n ? tpd.feePaid / tpd.used : 0n;

      // Check if we already have an item for this interval
      const existingIndex = trailingAvgStore.data.findIndex(
        (d) => d.timestamp >= itemStartTime && d.timestamp < tpd.nextTimestamp
      );

      if (existingIndex === -1) {
        // Create a new placeholder for the next item. It will be updated once is finished processing the current item
        trailingAvgStore.data.push({
          timestamp: item.timestamp,
          open: price.toString(),
          high: price.toString(),
          low: price.toString(),
          close: price.toString(),
        });

        trailingAvgStore.metadata.push({
          startTimestamp: itemStartTime,
          endTimestamp: tpd.nextTimestamp,
          used: tpd.used,
          feePaid: tpd.feePaid,
        });

        trailingAvgStore.trailingAvgData = [];

        trailingAvgStore.pointers[item.timestamp] =
          trailingAvgStore.data.length - 1;
      }
    }

    // Get the current placeholder index
    const trailingAvgStore = this.storage[interval].trailingAvgStore;
    const currentPlaceholderIndex = trailingAvgStore.data.length - 1;

    // Categorize the current item
    const isLastItem = currentIdx === this.runtime.dbResourcePricesLength - 1;
    const isNewInterval = item.timestamp > tpd.nextTimestamp;

    // Include the new item in the trailing avg data
    tpd.used += BigInt(item.used);
    tpd.feePaid += BigInt(item.feePaid);
    tpd.trailingAvgData.push({
      timestamp: item.timestamp,
      used: item.used,
      feePaid: item.feePaid,
    });

    if (isNewInterval || isLastItem) {
      let fixedFeePaid = tpd.feePaid;
      let fixedUsed = tpd.used;

      if (!isNewInterval) {
        // We need to remove the current item from the data since it's not in the current interval
        fixedFeePaid -= BigInt(item.feePaid);
        fixedUsed -= BigInt(item.used);
      }

      // Finalize the current interval
      const price = fixedUsed > 0n ? fixedFeePaid / fixedUsed : 0n;

      if (currentPlaceholderIndex >= 0) {
        // Update the placeholder with final values
        trailingAvgStore.data[currentPlaceholderIndex] = {
          timestamp: trailingAvgStore.data[currentPlaceholderIndex].timestamp,
          open: price.toString(),
          high: price.toString(),
          low: price.toString(),
          close: price.toString(),
        };

        trailingAvgStore.metadata[currentPlaceholderIndex] = {
          startTimestamp:
            trailingAvgStore.metadata[currentPlaceholderIndex].startTimestamp,
          endTimestamp: tpd.nextTimestamp,
          used: fixedUsed,
          feePaid: fixedFeePaid,
        };
        // Notice: Add the trailing avg data to the metadata, only if it's the last partial interval item
        if (!isNewInterval) {
          trailingAvgStore.trailingAvgData = tpd.trailingAvgData.slice(
            tpd.startTimestampIndex,
            currentIdx
          );
        }
      }

      // If not the last item, prepare for next interval
      if (!isLastItem) {
        tpd.nextTimestamp = this.nextInterval(item.timestamp, interval);

        // Create a placeholder for the next interval
        const itemStartTime = this.snapToInterval(item.timestamp, interval);

        // Check if we already have an item for this interval
        const existingIndex = trailingAvgStore.data.findIndex(
          (d) => d.timestamp >= itemStartTime && d.timestamp < tpd.nextTimestamp
        );

        if (existingIndex === -1) {
          // Create a new placeholder
          trailingAvgStore.data.push({
            timestamp: item.timestamp,
            open: price.toString(),
            high: price.toString(),
            low: price.toString(),
            close: price.toString(),
          });

          trailingAvgStore.metadata.push({
            startTimestamp: itemStartTime,
            endTimestamp: tpd.nextTimestamp,
            used: tpd.used,
            feePaid: tpd.feePaid,
          });

          trailingAvgStore.pointers[item.timestamp] =
            trailingAvgStore.data.length - 1;
        }
      }
    }

    if (!isLastItem) {
      // Remove the old items from the trailing avg if they are before the trailing avg timestamp
      let startIdx = tpd.startTimestampIndex;
      let oldItem = tpd.trailingAvgData[startIdx];
      const trailingAvgTimestamp = item.timestamp - this.trailingAvgTime;

      while (oldItem.timestamp < trailingAvgTimestamp) {
        tpd.used -= BigInt(oldItem.used);
        tpd.feePaid -= BigInt(oldItem.feePaid);
        startIdx++;
        tpd.startTimestampIndex = startIdx;
        if (startIdx >= this.runtime.dbResourcePricesLength) break;
        oldItem = tpd.trailingAvgData[startIdx];
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
      this.storage[interval].resourceStore.data,
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
    return this.getPricesFromArray(
      this.storage[interval].indexStore[epochId].data,
      from,
      to,
      interval,
      false
    );
  }

  getTrailingAvgPrices(from: number, to: number, interval: number) {
    this.checkInterval(interval);
    return this.getPricesFromArray(
      this.storage[interval].trailingAvgStore.data,
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

    const windowOfTime: {
      from: number;
      to: number;
    } = {
      from: this.snapToInterval(from, interval),
      to: this.snapToInterval(to, interval),
    };

    // Check if we need to process new data for this requested time range
    await this.updateStoreIfNeeded(prices, windowOfTime.to);

    // If there are no prices or window starts before first price, add zero entries
    if (fillMissing && windowOfTime.from < prices[0].timestamp) {
      const zeroEntries = [];
      for (let t = windowOfTime.from; t < prices[0].timestamp; t += interval) {
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
      (price) => price.timestamp >= windowOfTime.from
    );
    if (startIndex === -1) startIndex = prices.length;

    let endIndex = prices.length;
    for (let i = startIndex; i < prices.length; i++) {
      if (prices[i].timestamp > windowOfTime.to) {
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

  snapToInterval(timestamp: number, interval: number | undefined = undefined) {
    if (interval === undefined) {
      interval = ResourcePerformance.MIN_INTERVAL;
    }
    return Math.floor(timestamp / interval) * interval;
  }

  nextInterval(timestamp: number, interval: number | undefined = undefined) {
    if (interval === undefined) {
      interval = ResourcePerformance.MIN_INTERVAL;
    }
    return (Math.floor(timestamp / interval) + 1) * interval;
  }
}
