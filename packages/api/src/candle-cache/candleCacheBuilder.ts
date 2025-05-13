import {
  getConfig,
  getLastCandleFromDb,
  getMarketGroups,
  getMarketPrices,
  getResourcePrices,
  setConfig,
} from './dbUtils';
import { CANDLE_CACHE_CONFIG, CANDLE_TYPES } from './config';
import { log } from 'src/utils/logs';
import { RuntimeCandleStore } from './runtimeCandleStore';
import { TrailingAvgHistoryStore } from './trailingAvgHistoryStore';
import { MarketInfoStore } from './marketInfoStore';
import { ResourceCandleProcessor } from './processors/resourceCandleProcessor';
import { IndexCandleProcessor } from './processors/indexCandleProcessor';
import { TrailingAvgCandleProcessor } from './processors/trailingAvgCandleProcessor';
import { MarketCandleProcessor } from './processors/marketCandleProcessor';

export class CandleCacheBuilder {
  private static instance: CandleCacheBuilder;

  private runtimeCandles: RuntimeCandleStore;
  private trailingAvgHistory: TrailingAvgHistoryStore;
  private marketInfoStore: MarketInfoStore;
  private resourceCandleProcessor: ResourceCandleProcessor;
  private indexCandleProcessor: IndexCandleProcessor;
  private trailingAvgCandleProcessor: TrailingAvgCandleProcessor;
  private marketCandleProcessor: MarketCandleProcessor;

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
    this.marketInfoStore = MarketInfoStore.getInstance();
    this.resourceCandleProcessor = new ResourceCandleProcessor(this.runtimeCandles);
    this.indexCandleProcessor = new IndexCandleProcessor(this.runtimeCandles, this.marketInfoStore);
    this.trailingAvgCandleProcessor = new TrailingAvgCandleProcessor(this.runtimeCandles, this.trailingAvgHistory);
    this.marketCandleProcessor = new MarketCandleProcessor(this.runtimeCandles, this.marketInfoStore);
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
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }

  private async processResourcePrices() {
    log({ message: 'step 1', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 1. get the last processed resource price
    let lastProcessedResourcePrice = await getConfig(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice
    );
    log({ message: 'step 2', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 2. process by batches from last processed resource price to the latest resource price
    let getNextBatch = true;
    const needsTrailing = this.trailingResourceRuntime.length == 0; // not initialized, we need to get data from the past to fill the trailingResourceRuntime
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
      log({ message: `batch: ${iter} - step 1`, prefix: CANDLE_CACHE_CONFIG.logPrefix });
      const { prices, hasMore } = await getResourcePrices({
        initialTimestamp,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });
      log({
        message: `batch: ${iter} - step 2, batch size: ${prices.length}`,
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
          await this.resourceCandleProcessor.processResourcePrice(price, isLast);
          await this.indexCandleProcessor.processResourcePrice(price, isLast);
          for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
            await this.trailingAvgCandleProcessor.processResourcePrice(
              price,
              trailingAvgTime,
              isLast
            );
          }
        }
        batchIdx++;
      }
      log({ message: `batch: ${iter} - step 3`, prefix: CANDLE_CACHE_CONFIG.logPrefix });

      // 4. Update indexes for the next batch
      initialTimestamp = prices[prices.length - 1].timestamp;
      // Check if we are still in the trailing period
      lastProcessedResourcePrice =
        initialTimestamp > lastProcessedResourcePrice
          ? initialTimestamp
          : lastProcessedResourcePrice;
    }
    log({ message: 'step 4', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 5. update the last processed resource price
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
        await this.marketCandleProcessor.processMarketPrice(price, isLast);
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
    const allMarketIds = this.marketInfoStore.getAllMarketIndexes();
    const allResourceSlugs = this.marketInfoStore.getAllResourceSlugs();

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
