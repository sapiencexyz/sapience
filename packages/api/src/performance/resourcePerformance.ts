import { Resource } from 'src/models/Resource';
import {
  epochRepository,
  marketRepository,
  resourcePriceRepository,
} from 'src/db';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { Market } from 'src/models/Market';
import { Epoch } from 'src/models/Epoch';
import { CandleData, StorageData } from './types';
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

import { loadStorageFromFile, saveStorageToFile } from './helper';

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
        resourceStore: { data: [], metadata: [], pointers: {} },
        trailingAvgStore: { data: [], metadata: [], pointers: {} },
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
    await this.processResourceData();
  }

  async softInitialize() {
    const storage = await loadStorageFromFile(
      this.resource.slug,
      this.resource.name
    );

    if (!storage) {
      console.log('Storage not found, hard initializing');
      await this.hardInitialize();
      return;
    }

    this.storage = storage.store;

    this.lastTimestampProcessed = storage.latestTimestamp;

    // TODO: backfill the missing data from the db starting on the latest timestamp
    await this.processResourceData(this.lastTimestampProcessed);
  }

  private async processResourceData(initialTimestamp?: number) {
    console.time(`processResourceData.${this.resource.name}`);

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
      `processResourceData.${this.resource.name}.find.resourcePrices`
    );
    const dbResourcePrices = await resourcePriceRepository.find({
      where: whereClause,
      order: {
        timestamp: 'ASC',
      },
    });
    console.timeEnd(
      `processResourceData.${this.resource.name}.find.resourcePrices`
    );

    console.log(
      `processResourceData.${this.resource.name}.find.resourcePrices.length`,
      dbResourcePrices.length
    );

    if (dbResourcePrices.length === 0) {
      this.runtime.processingResourceItems = false;
      return;
    }

    // Find markets if not already loaded
    if (!this.markets || this.markets.length === 0) {
      console.time(`processResourceData.${this.resource.name}.find.markets`);
      this.markets = await marketRepository.find({
        where: {
          resource: { id: this.resource.id },
        },
      });
      console.timeEnd(`processResourceData.${this.resource.name}.find.markets`);
    }

    // Find epochs if not already loaded
    if (!this.epochs || this.epochs.length === 0) {
      console.time(`processResourceData.${this.resource.name}.find.epochs`);
      this.epochs = await epochRepository.find({
        where: {
          market: { resource: { id: this.resource.id } },
        },
        order: {
          startTimestamp: 'ASC',
        },
      });
      console.timeEnd(`processResourceData.${this.resource.name}.find.epochs`);
    }

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

    // Save the updated storage to file
    await saveStorageToFile(
      this.storage,
      this.lastTimestampProcessed,
      this.resource.slug,
      this.resource.name
    );

    console.timeEnd(`processResourceData.${this.resource.name}`);
    this.runtime.processingResourceItems = false;
  }

  // async backfillMarketPrices() {
  //   const dbMarketPrices = await marketPriceRepository.find({
  //     where: {
  //       resource: this.resource,
  //     },
  //     order: {
  //       timestamp: 'ASC',
  //     },
  //   });

  //   // TODO Do something with the market prices
  // }

  // getMarketPrices(from: number, to: number, interval: number) {
  //   this.checkInterval(interval);
  //   return this.getPricesFromArray(this.marketPrices[interval], from, to, interval);
  // }

  private processResourcePriceData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    if (!this.runtime.resourceProcessData[interval]) {
      this.runtime.resourceProcessData[interval] = {
        open: 0n,
        high: 0n,
        low: 0n,
        close: 0n,
        nextTimestamp: 0,
      };
    }

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
      // Finalize the current interval
      if (currentPlaceholderIndex >= 0) {
        // Update the placeholder with final values
        resourceStore.data[currentPlaceholderIndex] = {
          timestamp: resourceStore.data[currentPlaceholderIndex].timestamp,
          open: rpd.open.toString(),
          high: rpd.high.toString(),
          low: rpd.low.toString(),
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
      if (price > rpd.high) {
        rpd.high = price;
      }

      if (price < rpd.low) {
        rpd.low = price;
      }

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
      if (!epochStartTime || item.timestamp < epochStartTime) {
        continue;
      }

      if (!this.runtime.indexProcessData[interval]) {
        this.runtime.indexProcessData[interval] = {};
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

      // check if it's the last price item or last in the interval
      if (
        item.timestamp > ipd.nextTimestamp ||
        currentIdx === this.runtime.dbResourcePricesLength - 1
      ) {
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
        ipd.used = 0n;
        ipd.feePaid = 0n;

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

      // Update the placeholder
      const avgPrice = ipd.used > 0n ? ipd.feePaid / ipd.used : 0n;

      if (currentPlaceholderIndex >= 0) {
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
    }
  }

  private processTrailingAvgPricesData(
    item: ResourcePrice,
    currentIdx: number,
    interval: number
  ) {
    if (!this.runtime.trailingAvgProcessData[interval]) {
      this.runtime.trailingAvgProcessData[interval] = {
        used: 0n,
        feePaid: 0n,
        nextTimestamp: 0,
        startTimestampIndex: 0,
        endTimestampIndex: 0,
        startTimestamp: 0,
        endTimestamp: 0,
      };
    }

    const tpd = this.runtime.trailingAvgProcessData[interval];

    // If this is the first item or we're starting a new interval
    if (!tpd.nextTimestamp) {
      tpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      tpd.used = BigInt(item.used);
      tpd.feePaid = BigInt(item.feePaid);
      tpd.startTimestamp = item.timestamp;
      tpd.endTimestamp = item.timestamp;
      tpd.startTimestampIndex = currentIdx;
      tpd.endTimestampIndex = currentIdx;

      // Create a placeholder in the store
      const trailingAvgStore = this.storage[interval].trailingAvgStore;
      const itemStartTime = this.snapToInterval(item.timestamp, interval);
      const price = tpd.used > 0n ? tpd.feePaid / tpd.used : 0n;

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

    // Get the current placeholder index
    const trailingAvgStore = this.storage[interval].trailingAvgStore;
    const currentPlaceholderIndex = trailingAvgStore.data.length - 1;

    if (
      item.timestamp > tpd.nextTimestamp ||
      currentIdx === this.runtime.dbResourcePricesLength - 1
    ) {
      // Finalize the current interval
      const price = tpd.used > 0n ? tpd.feePaid / tpd.used : 0n;

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
          used: tpd.used,
          feePaid: tpd.feePaid,
        };
      }

      // Prepare for next interval
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

    // Remove the old items from the trailing avg if they are before the trailing avg timestamp
    let startIdx = tpd.startTimestampIndex;
    let oldItem = this.runtime.dbResourcePrices[startIdx];
    const trailingAvgTimestamp = item.timestamp - this.trailingAvgTime;
    while (oldItem.timestamp < trailingAvgTimestamp) {
      tpd.used -= BigInt(oldItem.used);
      tpd.feePaid -= BigInt(oldItem.feePaid);
      startIdx++;
      tpd.startTimestampIndex = startIdx;
      if (startIdx >= this.runtime.dbResourcePricesLength) break;
      oldItem = this.runtime.dbResourcePrices[startIdx];
    }

    // We are adding the new item to the trailing avg if it's in the next interval
    if (item.timestamp <= tpd.nextTimestamp) {
      tpd.used += BigInt(item.used);
      tpd.feePaid += BigInt(item.feePaid);
      tpd.endTimestampIndex = currentIdx;

      // Update the placeholder
      const price = tpd.used > 0n ? tpd.feePaid / tpd.used : 0n;

      if (currentPlaceholderIndex >= 0) {
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
          used: tpd.used,
          feePaid: tpd.feePaid,
        };
      }
    }
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

  getIndexPrices(from: number, to: number, interval: number, epoch: string) {
    this.checkInterval(interval);
    return this.getPricesFromArray(
      this.storage[interval].indexStore[epoch].data,
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

  private getPricesFromArray(
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
    return pricesInRange;
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
