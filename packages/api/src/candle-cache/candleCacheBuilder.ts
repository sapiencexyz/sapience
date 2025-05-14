import {
  getConfig,
  getLastCandleFromDb,
  getMarketGroups,
  getMarketPrices,
  getResourcePrices,
  setConfig,
  saveCandle,
  getResourcePricesCount,
  getMarketPricesCount,
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
    log({ message: 'step 1: get updated markets and market groups', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.getUpdatedMarketsAndMarketGroups();
    log({ message: 'step 2: update candles if needed', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.updateCandlesIfNeeded();
    log({ message: 'step 3: process resource prices', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.processResourcePrices();
    log({ message: 'step 4: process market prices', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.processMarketPrices();
    log({ message: 'step 5: save all runtime candles', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    await this.saveAllRuntimeCandles();
    log({ message: 'step 6: done', prefix: CANDLE_CACHE_CONFIG.logPrefix });
  }

  private async getUpdatedMarketsAndMarketGroups() {
    // get all market groups
    const marketGroups = await getMarketGroups();
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }

  private async processResourcePrices() {
    log({ message: 'step 1: get the last processed resource price', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 1. get the last processed resource price
    let lastProcessedResourcePrice = await getConfig(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice
    );
    log({ message: 'step 2: process by batches from last processed resource price to the latest resource price', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 2. process by batches from last processed resource price to the latest resource price
    let getNextBatch = true;
    const needsTrailing = this.trailingAvgHistory.isEmpty(); // not initialized, we need to get data from the past to fill the trailingResourceRuntime
    let initialTimestamp = needsTrailing
      ? Math.max(
          lastProcessedResourcePrice - CANDLE_CACHE_CONFIG.preTrailingAvgTime,
          0
        )
      : lastProcessedResourcePrice;
    log({ message: `step 3: process the batches from ${initialTimestamp} (${lastProcessedResourcePrice})`, prefix: CANDLE_CACHE_CONFIG.logPrefix });
    const totalResourcePrices = await getResourcePricesCount(initialTimestamp);
    const totalBatches = Math.ceil(totalResourcePrices / CANDLE_CACHE_CONFIG.batchSize);
    let iter = 0;
    while (getNextBatch) {
      iter++;
      log({ message: `batch: ${iter}/${totalBatches} - step 1: get the batch`, prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2 });
      const { prices, hasMore } = await getResourcePrices({
        initialTimestamp,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });
      getNextBatch = hasMore;
      if (prices.length === 0) {
        log({
          message: `batch is empty: ${iter}/${totalBatches} - step 2`,
          prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2,
        });
          break;
      }
      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2,
      });
      const batchStartTime = Date.now();
      // 3. Process the batch
      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];
        // Add it to the trailing avg history
        for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
          this.trailingAvgHistory.addPriceAndGetSums(price.resource.slug, trailingAvgTime, {
            timestamp: price.timestamp,
            used: price.used,
            fee: price.feePaid,
          });
        }

        if (price.timestamp > lastProcessedResourcePrice) {
          // process the item for the candles
          await this.resourceCandleProcessor.processResourcePrice(price);
          await this.indexCandleProcessor.processResourcePrice(price);
          for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
            await this.trailingAvgCandleProcessor.processResourcePrice(
              price,
              trailingAvgTime
            );
          }
        }
        batchIdx++;
      }
      const batchEndTime = Date.now();
      const batchDuration = (batchEndTime - batchStartTime) / 1000; // Convert to seconds
      log({ message: `batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`, prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2 });

      // 4. Update indexes for the next batch
      initialTimestamp = prices[prices.length - 1].timestamp;
      // Check if we are still in the trailing period
      lastProcessedResourcePrice =
        initialTimestamp > lastProcessedResourcePrice
          ? initialTimestamp
          : lastProcessedResourcePrice;

      await setConfig(
        CANDLE_CACHE_CONFIG.lastProcessedResourcePrice,
        lastProcessedResourcePrice
      );
      
    }
    log({ message: 'step 4: update the last processed resource price', prefix: CANDLE_CACHE_CONFIG.logPrefix, });
    // 5. update the last processed resource price
    await setConfig(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice,
      lastProcessedResourcePrice
    );
  }

  private async processMarketPrices() {
    log({ message: 'step 1: get the last processed market price', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 1. get the last processed market price
    let lastProcessedMarketPrice = await getConfig(
      CANDLE_CACHE_CONFIG.lastProcessedMarketPrice
    );
    log({ message: 'step 2: process by batches from last processed market price to the latest market price', prefix: CANDLE_CACHE_CONFIG.logPrefix });
    // 2. process by batches from last processed market price to the latest market price
    let getNextBatch = true;
    const totalMarketPrices = await getMarketPricesCount(lastProcessedMarketPrice);
    const totalBatches = Math.ceil(totalMarketPrices / CANDLE_CACHE_CONFIG.batchSize);
    let iter = 0;
    while (getNextBatch) {
      iter++;
      log({ message: `${iter}/${totalBatches} - step 1`, prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2 });
      const { prices, hasMore } = await getMarketPrices({
        initialTimestamp: lastProcessedMarketPrice,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });
      getNextBatch = hasMore;
      if (prices.length === 0) {
        log({
          message: `batch is empty: ${iter}/${totalBatches} - step 2`,
          prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2,
        });
        break;
      }
      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2,
      });
      // 3. Process the batch
      const batchStartTime = Date.now();
      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];
        await this.marketCandleProcessor.processMarketPrice(price);
        batchIdx++;
      }

      const batchEndTime = Date.now();
      const batchDuration = (batchEndTime - batchStartTime) / 1000; // Convert to seconds
      log({ message: `batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`, prefix: CANDLE_CACHE_CONFIG.logPrefix, indent: 2 });

      // 4. Update the last processed market price and update the pointer for the next batch in case of restart
      if (prices.length > 0) {
        lastProcessedMarketPrice = prices[prices.length - 1].timestamp;
        await setConfig(
          CANDLE_CACHE_CONFIG.lastProcessedMarketPrice,
          lastProcessedMarketPrice
        );
          }
    }

    log({ message: 'step 3: update the last processed market price', prefix: CANDLE_CACHE_CONFIG.logPrefix });
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

  private async saveAllRuntimeCandles() {
    // Save all market candles
    const marketIndices = this.runtimeCandles.getAllMarketIndices();
    for (const marketIdx of marketIndices) {
      const marketCandles = this.runtimeCandles.getAllMarketCandles(marketIdx);
      for (const candle of marketCandles.values()) {
        await saveCandle(candle);
      }
    }

    // Save all resource candles
    const resourceSlugs = this.runtimeCandles.getAllResourceSlugs();
    for (const resourceSlug of resourceSlugs) {
      const resourceCandles = this.runtimeCandles.getAllResourceCandles(resourceSlug);
      for (const candle of resourceCandles.values()) {
        await saveCandle(candle);
      }

      // Save all index candles for this resource's markets
      const marketIds = this.marketInfoStore.getAllMarketIndexesByResourceSlug(resourceSlug);
      for (const marketId of marketIds) {
        const indexCandles = this.runtimeCandles.getAllIndexCandles(marketId);
        for (const candle of indexCandles.values()) {
          await saveCandle(candle);
        }
      }

      // Save all trailing average candles for this resource
      for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
        const trailingAvgCandles = this.runtimeCandles.getAllTrailingAvgCandles(resourceSlug, trailingAvgTime);
        for (const candle of trailingAvgCandles.values()) {
          await saveCandle(candle);
        }
      }
    }
  }
}
