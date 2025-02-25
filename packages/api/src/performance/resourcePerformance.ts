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
import { In } from 'typeorm';
import {
  CandleData,
  StorageData,
} from './types';

import {
  INTERVAL_5_MINUTES,
  INTERVAL_15_MINUTES,
  INTERVAL_30_MINUTES,
  INTERVAL_4_HOURS,
  INTERVAL_1_DAY,
  INTERVAL_28_DAYS,
} from './constants';

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

  async backfillResourcePrices() {
    console.time(`backfillResourcePrices.${this.resource.name}`);
    console.time(
      `backfillResourcePrices.${this.resource.name}.find.resourcePrices`
    );
    if (this.runtime.processingResourceItems) {
      throw new Error('Resource prices are already being processed');
    }

    this.runtime.processingResourceItems = true;
    const dbResourcePrices = await resourcePriceRepository.find({
      where: {
        resource: { id: this.resource.id },
      },
      order: {
        timestamp: 'ASC',
      },
    });
    console.timeEnd(
      `backfillResourcePrices.${this.resource.name}.find.resourcePrices`
    );
    console.log(
      `backfillResourcePrices.${this.resource.name}.find.resourcePrices.length`,
      dbResourcePrices.length
    );
    if (dbResourcePrices.length === 0) {
      this.runtime.processingResourceItems = false;
      return;
    }

    // find markets
    console.time(`backfillResourcePrices.${this.resource.name}.find.markets`);
    this.markets = await marketRepository.find({
      where: {
        resource: { id: this.resource.id },
      },
    });
    console.timeEnd(
      `backfillResourcePrices.${this.resource.name}.find.markets`
    );

    // find epochs
    console.time(`backfillResourcePrices.${this.resource.name}.find.epochs`);
    this.epochs = await epochRepository.find({
      where: {
        market: In(this.markets.map((m) => m.id)),
      },
      order: {
        startTimestamp: 'ASC',
      },
    });
    console.timeEnd(`backfillResourcePrices.${this.resource.name}.find.epochs`);
    // clean up runtime
    this.runtime.indexProcessData = {};
    this.runtime.dbResourcePricesLength = dbResourcePrices.length;
    this.runtime.dbResourcePrices = dbResourcePrices;
    this.runtime.currentIdx = 0;
    // TODO: do the initialization of the storage and runtime here


    while (this.runtime.currentIdx < dbResourcePrices.length) {
      const item = dbResourcePrices[this.runtime.currentIdx];
      for (const interval of this.intervals) {
        this.processResourcePriceData(item, this.runtime.currentIdx, interval);
        this.processTrailingAvgPricesData(item, this.runtime.currentIdx, interval);
        // this.backFillMarketPrices(currentDbResourcePrice, interval);
        this.processIndexPricesData(item, this.runtime.currentIdx, interval);
      }
      this.runtime.currentIdx++;
    }
    this.lastTimestampProcessed = dbResourcePrices[this.runtime.currentIdx - 1].timestamp;
    console.timeEnd(`backfillResourcePrices.${this.resource.name}`);
    // Save storage to JSON file
    // console.time(`backfillResourcePrices.${this.resource.name}.saveStorage`);
    // const fs = await import('fs');
    // const path = await import('path');

    // const storageDir = path.join(process.cwd(), 'storage');
    // if (!fs.existsSync(storageDir)) {
    //   fs.mkdirSync(storageDir);
    // }

    // const filename = path.join(
    //   storageDir,
    //   `${this.resource.slug}-storage.json`
    // );
    // await fs.promises.writeFile(
    //   filename,
    //   JSON.stringify(
    //     this.storage,
    //     (key, value) =>
    //       typeof value === 'bigint' ? value.toString() : value, // return everything else unchanged
    //     2
    //   )
    // );

    // console.timeEnd(`backfillResourcePrices.${this.resource.name}.saveStorage`);
    // console.log(`Saved storage to ${filename}`);
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
    if (!rpd.nextTimestamp) {
      rpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
      rpd.close = price;
    }

    if (
      item.timestamp > rpd.nextTimestamp ||
      currentIdx === this.runtime.dbResourcePricesLength - 1
    ) {
      // is in next interval, push to store and reset the runtime values for the next interval
      // push to the store
      const resourceStore = this.storage[interval].resourceStore;

      resourceStore.data.push({
        timestamp: item.timestamp,
        open: rpd.open.toString(),
        high: rpd.high.toString(),
        low: rpd.low.toString(),
        close: price.toString(),
      });
      const itemStartTime = rpd.nextTimestamp;
      rpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      resourceStore.metadata.push({
        startTimestamp: itemStartTime,
        endTimestamp: rpd.nextTimestamp,
        used: 0n,
        feePaid: 0n,
      });
      resourceStore.pointers[item.timestamp] = resourceStore.data.length - 1;

      // prepare next interval. Notice, don't reset the used and feePaid here because is an index price
      rpd.open = price;
      rpd.high = price;
      rpd.low = price;
    } else {
      if (price > rpd.high) {
        rpd.high = price;
      }

      if (price < rpd.low) {
        rpd.low = price;
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
      if (!ipd.nextTimestamp) {
        ipd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      }

      // check if it's the last price item or last in the interval
      if (
        item.timestamp > ipd.nextTimestamp ||
        currentIdx === this.runtime.dbResourcePricesLength - 1
      ) {
        // push to the store
        const avgPrice = ipd.used > 0n ? ipd.feePaid / ipd.used : 0n;
        // TODO Move initialization up in the function calls
        if (!this.storage[interval].indexStore[epoch.id]) {
          this.storage[interval].indexStore[epoch.id] = {
            data: [],
            metadata: [],
            pointers: {},
          };
        }
        const indexStore = this.storage[interval].indexStore[epoch.id];

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

        // prepare next interval. Notice, don't reset the used and feePaid here because is an index price
        ipd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      }

      ipd.used += BigInt(item.used);
      ipd.feePaid += BigInt(item.feePaid);
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
    if (!tpd.nextTimestamp) {
      tpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      tpd.used = BigInt(item.used);
      tpd.feePaid = BigInt(item.feePaid);
      tpd.startTimestamp = item.timestamp;
      tpd.endTimestamp = item.timestamp;
      tpd.startTimestampIndex = currentIdx;
      tpd.endTimestampIndex = currentIdx;
    }

    if (
      item.timestamp > tpd.nextTimestamp ||
      currentIdx === this.runtime.dbResourcePricesLength - 1
    ) {
      // is in next interval, push to store and reset the runtime values for the next interval
      // push to the store
      const resourceStore = this.storage[interval].resourceStore;

      const price = tpd.used > 0n ? tpd.feePaid / tpd.used : 0n;

      resourceStore.data.push({
        timestamp: item.timestamp,
        open: price.toString(),
        high: price.toString(),
        low: price.toString(),
        close: price.toString(),
      });
      const itemStartTime = tpd.nextTimestamp;
      tpd.nextTimestamp = this.nextInterval(item.timestamp, interval);
      resourceStore.metadata.push({
        startTimestamp: itemStartTime,
        endTimestamp: tpd.nextTimestamp,
        used: tpd.used,
        feePaid: tpd.feePaid,
      });
      resourceStore.pointers[item.timestamp] = resourceStore.data.length - 1;

      // prepare next interval. Notice, don't reset the used and feePaid here because is an index price
      tpd.used = price;
      tpd.feePaid = price;
    }


    // Remove the old items from the trailing avg if they are before the trailing avg timestamp
    let startIdx = tpd.startTimestampIndex;
    let oldItem = this.runtime.dbResourcePrices[startIdx];
    let trailingAvgTimestamp = tpd.nextTimestamp - this.trailingAvgTime;
    while(oldItem.timestamp < trailingAvgTimestamp) {
      startIdx++;
      oldItem = this.runtime.dbResourcePrices[startIdx];
      tpd.used -= BigInt(item.used);
      tpd.feePaid -= BigInt(item.feePaid);
      tpd.startTimestampIndex = startIdx;
    }

    // We are adding the new item to the trailing avg if it's in the next interval
    if (item.timestamp <= tpd.nextTimestamp) {
      tpd.used += BigInt(item.used);
      tpd.feePaid += BigInt(item.feePaid);
      tpd.endTimestampIndex = currentIdx;
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
      interval
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
    interval: number
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
    if (windowOfTime.from < prices[0].timestamp) {
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
