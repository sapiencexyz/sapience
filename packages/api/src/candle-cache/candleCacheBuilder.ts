import {
  getConfig,
  getLastCandleFromDb,
  getMarketGroups,
  getMarketPrices,
  getResourcePrices,
  saveCandle,
  setConfig,
} from './dbUtils';
import { CANDLE_CACHE_CONFIG, CANDLE_TYPES } from './config';
import { log } from 'src/utils/logs';
import { ResourcePrice } from 'src/models/ResourcePrice';
import { ReducedMarketPrice } from './types';
import { CacheCandle } from 'src/models/CacheCandle';
import { RuntimeCandleStore } from './runtimeCandleStore';
import { TrailingAvgHistoryStore } from './trailingAvgHistoryStore';
import { getTimtestampCandleInterval } from './candleUtils';

export class CandleCacheBuilder {
  private static instance: CandleCacheBuilder;

  private marketIds: Map<
    number,
    {
      resourceSlug: string;
      marketGroupIdx: number;
      marketId: number;
      marketGroupAddress: string;
      marketGroupChainId: number;
    }
  > = new Map();

  private runtimeCandles: RuntimeCandleStore;
  private trailingAvgHistory: TrailingAvgHistoryStore;

  private trailingResourceRuntime: {
    resourceIdx: number;
    trainingData: {
      timestamp: number;
      used: number;
      fee: number;
    }[];
  }[] = [];

  private constructor() {
    this.runtimeCandles = new RuntimeCandleStore();
    this.trailingAvgHistory = new TrailingAvgHistoryStore();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheBuilder();
    }
    return this.instance;
  }

  public async updateCandles() {
    log({ message: 'step 1', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.getUpdatedMarketsAndMarketGroups();
    log({ message: 'step 2', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.updateCandlesIfNeeded();
    log({ message: 'step 3', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.processResourcePrices();
    log({ message: 'step 4', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.processMarketPrices();
    log({ message: 'step 5', prefix: CANDLE_CACHE_CONFIG.logPrefix });
  }

  private async getUpdatedMarketsAndMarketGroups() {
    // get all market groups
    const marketGroups = await getMarketGroups();

    for (const marketGroup of marketGroups) {
      // Add resource slug
      const resourceSlug = marketGroup.resource
        ? marketGroup.resource.slug
        : 'no-resource';

      // Add market with extra data
      if (marketGroup.markets) {
        for (const market of marketGroup.markets) {
          if (this.marketIds.has(market.id)) {
            continue;
          }
          this.marketIds.set(market.id, {
            marketId: market.marketId,
            marketGroupIdx: marketGroup.id,
            resourceSlug,
            marketGroupAddress: marketGroup.address,
            marketGroupChainId: marketGroup.chainId,
          });
        }
      }
    }
  }

  // TODO: this needs to be implemented.
  /**
   * @dev this method should process all the prices, not per resource. By batches
   * The very first time it runs, it will process all prices from the initial time.
   * The first time it runs on a restart it will, first, populate the trailing average arrays.
   *
   * On normal process, it will get batches of prices and process each one as it comes.
   * First it needs to identify the resource/marketGroup/market to which the price belongs
   * Then it needs to add the data to the corresponding trailing avg arrays (for all the trailing avg lenghts)
   * Then it will do the math for each candle it touches. Notice this part will be shared with the `candleCacheReBuilder`
   * If the candle is finished, save it to the db.
   * And finally, when the whole batch is done, update the state to continue on the next run
   */
  private async processResourcePrices() {
    log({ message: 'step 1', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 1. get the last processed resource price
    let lastProcessedResourcePrice = await getConfig(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice
    );
    log({ message: 'step 2', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 2. process by batches from last processed resource price to the latest resource price
    let getNextBatch = true;
    let needsTrailing = this.trailingResourceRuntime.length == 0; // not initialized, we need to get data from the past to fill the trailingResourceRuntime
    let initialTimestamp = needsTrailing
      ? Math.max(
          lastProcessedResourcePrice - CANDLE_CACHE_CONFIG.preTrailingAvgTime,
          0
        )
      : lastProcessedResourcePrice;
    log({ message: 'step 3', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    let iter = 0;
    while (getNextBatch) {
      iter++;
      log({ message: `${iter} - 1`, prefix: CANDLE_CACHE_CONFIG.logPrefix });
      const { prices, hasMore } = await getResourcePrices({
        initialTimestamp,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });
      log({
        message: `${iter} - 2, ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
      });
      getNextBatch = hasMore;
      // 3. Process the batch
      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];
        const isLast = batchIdx == prices.length - 1;
        // Add it to the trailing avg history
        this.trailingAvgHistory.addPrice(price.resource.slug, {
          timestamp: price.timestamp,
          used: price.used,
          fee: price.feePaid,
        });

        if (price.timestamp > lastProcessedResourcePrice) {
          // process the item for the candles
          await this.processResourcePriceForResourceCandle(price, isLast);
          await this.processResourcePriceForIndexCandle(price, isLast);
          for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
            await this.processResourcePriceForTrailingAvgCandle(
              price,
              trailingAvgTime,
              isLast
            );
          }
        }
        batchIdx++;
      }
      log({ message: `${iter} - 3`, prefix: CANDLE_CACHE_CONFIG.logPrefix });

      // 4. Save the candles to the database
      // 5. Update indexes for the next batch
      initialTimestamp = prices[prices.length - 1].timestamp;
      // Check if we are still in the trailing period
      lastProcessedResourcePrice =
        initialTimestamp > lastProcessedResourcePrice
          ? initialTimestamp
          : lastProcessedResourcePrice;
    }
    log({ message: 'step 4', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 6. update the last processed resource price
    await setConfig(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice,
      lastProcessedResourcePrice
    );
  }

  private async processMarketPrices() {
    log({ message: 'step 1', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 1. get the last processed market price
    let lastProcessedMarketPrice = await getConfig(
      CANDLE_CACHE_CONFIG.lastProcessedMarketPrice
    );
    log({ message: 'step 2', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 2. process by batches from last processed market price to the latest market price
    let getNextBatch = true;
    let iter = 0;
    while (getNextBatch) {
      iter++;
      log({ message: `${iter} - 1`, prefix: CANDLE_CACHE_CONFIG.logPrefix });
      const { prices, hasMore } = await getMarketPrices({
        initialTimestamp: lastProcessedMarketPrice,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });
      log({
        message: `${iter} - 2, ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
      });
      getNextBatch = hasMore;
      // 3. Process the batch
      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];
        const isLast = batchIdx == prices.length - 1;
        this.processMarketPriceForMarketCandle(price, isLast);
        batchIdx++;
      }

      // 4. Save the candles to the database
      // 5. Update the last processed market price
      if (prices.length > 0) {
        lastProcessedMarketPrice = prices[prices.length - 1].timestamp;
      }
    }
    log({ message: 'step 3', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await setConfig(
      CANDLE_CACHE_CONFIG.lastProcessedMarketPrice,
      lastProcessedMarketPrice
    );
  }

  private async processResourcePriceForResourceCandle(
    price: ResourcePrice,
    isLast: boolean
  ) {
    const getNewCandle = (
      interval: number,
      candleTimestamp: number,
      candleEndTimestamp: number,
      price: ResourcePrice,
      resourceSlug: string
    ) => {
      const candle = new CacheCandle();
      candle.candleType = CANDLE_TYPES.RESOURCE;
      candle.interval = interval;
      candle.resourceSlug = resourceSlug;
      candle.timestamp = candleTimestamp;
      candle.endTimestamp = candleEndTimestamp;
      candle.lastUpdatedTimestamp = price.timestamp;
      candle.open = price.value;
      candle.high = price.value;
      candle.low = price.value;
      candle.close = price.value;
      return candle;
    };

    // For each interval add the price to the candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      // Calculate the start and end of the candle
      const { start: candleTimestamp, end: candleEndTimestamp } =
        getTimtestampCandleInterval(price.timestamp, interval);

      // Get existing candle or create new one
      let candle = this.runtimeCandles.getResourceCandle(
        price.resource.slug,
        interval
      );

      // Skip if this price is older than the last update of the current candle
      if (candle && candle.lastUpdatedTimestamp >= price.timestamp) {
        continue;
      }

      // If we have a candle but it's from a different period, save it and create a new one
      if (candle && candle.timestamp < candleTimestamp) {
        await saveCandle(candle);
        candle = getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          price.resource.slug
        );
        this.runtimeCandles.setResourceCandle(
          price.resource.slug,
          interval,
          candle
        );
      } else if (!candle) {
        // Create new candle if none exists
        candle = getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          price.resource.slug
        );
        this.runtimeCandles.setResourceCandle(
          price.resource.slug,
          interval,
          candle
        );
      } else {
        // Update existing candle
        candle.high = String(
          Math.max(Number(candle.high), Number(price.value))
        );
        candle.low = String(Math.min(Number(candle.low), Number(price.value)));
        candle.close = price.value;
        candle.lastUpdatedTimestamp = price.timestamp;
      }

      // Save the candle if it's the last item in the batch
      if (isLast) {
        await saveCandle(candle);
      }
    }
  }

  private async processResourcePriceForIndexCandle(
    price: ResourcePrice,
    isLast: boolean
  ) {}

  private async processResourcePriceForTrailingAvgCandle(
    price: ResourcePrice,
    trailingAvgTime: number,
    isLast: boolean
  ) {
    const getNewCandle = (
      interval: number,
      candleTimestamp: number,
      candleEndTimestamp: number,
      price: ResourcePrice,
      resourceSlug: string
    ) => {
      const candle = new CacheCandle();
      candle.candleType = CANDLE_TYPES.TRAILING_AVG;
      candle.interval = interval;
      candle.resourceSlug = resourceSlug;
      return candle;
    };

    // Get the prices for this trailing average period
    const prices = this.trailingAvgHistory.getPricesForTrailingAvg(
      price.resource.slug,
      trailingAvgTime
    );

    // Calculate the trailing average
    if (prices.length > 0) {
      const sum = prices.reduce((acc, p) => acc + Number(p.used), 0);
      const avg = sum / prices.length;

      // For each interval, update the trailing average candle
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        const candleTimestamp =
          Math.floor(price.timestamp / interval) * interval;

        let candle = this.runtimeCandles.getTrailingAvgCandle(
          price.resource.slug,
          interval,
          trailingAvgTime
        );

        if (!candle) {
          candle = new CacheCandle();
          candle.candleType = CANDLE_TYPES.TRAILING_AVG;
          candle.interval = interval;
          candle.resourceSlug = price.resource.slug;
          candle.timestamp = candleTimestamp;
          candle.open = String(avg);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.sumUsed = '0';
          candle.sumFeePaid = '0';
          candle.trailingStartTimestamp = prices[0].timestamp;
          candle.trailingAvgTime = trailingAvgTime;
        } else if (candle.timestamp < candleTimestamp) {
          await saveCandle(candle);

          candle = new CacheCandle();
          candle.candleType = CANDLE_TYPES.TRAILING_AVG;
          candle.interval = interval;
          candle.resourceSlug = price.resource.slug;
          candle.timestamp = candleTimestamp;
          candle.open = String(avg);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.sumUsed = '0';
          candle.sumFeePaid = '0';
          candle.trailingStartTimestamp = prices[0].timestamp;
          candle.trailingAvgTime = trailingAvgTime;
        } else {
          candle.high = String(Math.max(Number(candle.high), avg));
          candle.low = String(Math.min(Number(candle.low), avg));
          candle.close = String(avg);
        }

        this.runtimeCandles.setTrailingAvgCandle(
          price.resource.slug,
          interval,
          trailingAvgTime,
          candle
        );
      }
    }
  }

  private async processMarketPriceForMarketCandle(
    price: ReducedMarketPrice,
    isLast: boolean
  ) {
    const getNewCandle = (
      interval: number,
      candleTimestamp: number,
      candleEndTimestamp: number,
      price: ReducedMarketPrice,
      resourceSlug: string
    ) => {
      const candle = new CacheCandle();
      candle.candleType = CANDLE_TYPES.MARKET;
      candle.interval = interval;
      candle.marketIdx = price.market;
      candle.resourceSlug = resourceSlug;
      candle.timestamp = candleTimestamp;
      candle.endTimestamp = candleEndTimestamp;
      candle.lastUpdatedTimestamp = price.timestamp;
      candle.open = price.value;
      candle.high = price.value;
      candle.low = price.value;
      candle.close = price.value;
      candle.marketId = price.market;
      return candle;
    };

    // Find the market data from marketIds using price.market
    const marketData = this.marketIds.get(price.market);
    if (!marketData) {
      throw Error(`Market ${price.market} not found`);
    }

    // For each interval add the price to the candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      // Calculate the start and end of the candle
      const { start: candleTimestamp, end: candleEndTimestamp } =
        getTimtestampCandleInterval(price.timestamp, interval);

      // Get existing candle or create new one
      let candle = this.runtimeCandles.getMarketCandle(price.market, interval);

      // Skip if this price is older than the last update of the current candle
      if (candle && candle.lastUpdatedTimestamp >= price.timestamp) {
        continue;
      }

      // If we have a candle but it's from a different period, save it and create a new one
      if (candle && candle.timestamp < candleTimestamp) {
        await saveCandle(candle);
        candle = getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketData.resourceSlug
        );
        this.runtimeCandles.setMarketCandle(price.market, interval, candle);
      } else if (!candle) {
        // Create new candle if none exists
        candle = getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketData.resourceSlug
        );
        this.runtimeCandles.setMarketCandle(price.market, interval, candle);
      } else {
        // Update existing candle
        candle.high = String(
          Math.max(Number(candle.high), Number(price.value))
        );
        candle.low = String(Math.min(Number(candle.low), Number(price.value)));
        candle.close = price.value;
        candle.lastUpdatedTimestamp = price.timestamp;
      }

      // Save the candle if it's the last item in the batch
      if (isLast) {
        await saveCandle(candle);
      }
    }
  }

  // This helper that can be moved to some utils library
  private async updateCandlesIfNeeded() {
    // 1. Check if we have candles in the runtime
    const missingCandles = this.getRuntimeMissingCandleStores();

    // 2. If not, get them from the db
    // Markets
    for (const marketIdx of missingCandles.marketMarketCandles) {
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        const candle = await getLastCandleFromDb({
          candleType: CANDLE_TYPES.MARKET,
          marketIdx,
          interval,
        });

        if (!candle) {
          continue;
        }

        this.runtimeCandles.setMarketCandle(marketIdx, interval, candle);
      }
    }

    // Resources
    for (const resourceSlug of missingCandles.resourceResourceCandles) {
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        const candle = await getLastCandleFromDb({
          candleType: CANDLE_TYPES.RESOURCE,
          resourceSlug,
          interval,
        });

        if (!candle) {
          continue;
        }

        this.runtimeCandles.setResourceCandle(resourceSlug, interval, candle);
      }
    }

    // Indexes
    for (const marketIdx of missingCandles.resourceIndexCandles) {
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        const candle = await getLastCandleFromDb({
          candleType: CANDLE_TYPES.INDEX,
          marketIdx,
          interval,
        });

        if (!candle) {
          continue;
        }

        this.runtimeCandles.setIndexCandle(marketIdx, interval, candle);
      }
    }

    // Trailing Averages
    for (const resourceSlug of missingCandles.resourceTrailingAvgCandles) {
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
          const candle = await getLastCandleFromDb({
            candleType: CANDLE_TYPES.TRAILING_AVG,
            resourceSlug,
            interval,
            trailingAvgTime,
          });

          if (!candle) {
            continue;
          }

          this.runtimeCandles.setTrailingAvgCandle(
            resourceSlug,
            interval,
            trailingAvgTime,
            candle
          );
        }
      }
    }
  }

  private getRuntimeMissingCandleStores() {
    const allMarketIds = Array.from(this.marketIds.keys());
    const allResourceSlugs = Array.from(this.marketIds.values()).map(
      (m) => m.resourceSlug
    );

    const missingCandles: {
      marketMarketCandles: number[];
      resourceIndexCandles: number[];
      resourceResourceCandles: string[];
      resourceTrailingAvgCandles: string[];
    } = {
      marketMarketCandles: [],
      resourceIndexCandles: [],
      resourceResourceCandles: [],
      resourceTrailingAvgCandles: [],
    };

    for (const marketId of allMarketIds) {
      if (!this.runtimeCandles.hasMarketCandles(marketId)) {
        missingCandles.marketMarketCandles.push(marketId);
      }

      if (!this.runtimeCandles.hasIndexCandles(marketId)) {
        missingCandles.resourceIndexCandles.push(marketId);
      }
    }

    for (const resourceSlug of allResourceSlugs) {
      if (!this.runtimeCandles.hasResourceCandles(resourceSlug)) {
        missingCandles.resourceResourceCandles.push(resourceSlug);
      }

      if (!this.runtimeCandles.hasTrailingAvgCandles(resourceSlug)) {
        missingCandles.resourceTrailingAvgCandles.push(resourceSlug);
      }
    }

    return missingCandles;
  }
}
