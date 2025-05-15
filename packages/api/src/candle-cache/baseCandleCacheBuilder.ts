import { CANDLE_CACHE_CONFIG } from './config';
import {
  getMarketGroups,
  getMarketPrices,
  getResourcePrices,
  setParam,
  saveCandle,
  getResourcePricesCount,
  getMarketPricesCount,
} from './dbUtils';
import { log } from 'src/utils/logs';
import { RuntimeCandleStore } from './runtimeCandleStore';
import { TrailingAvgHistoryStore } from './trailingAvgHistoryStore';
import { MarketInfoStore } from './marketInfoStore';
import { ResourceCandleProcessor } from './processors/resourceCandleProcessor';
import { IndexCandleProcessor } from './processors/indexCandleProcessor';
import { TrailingAvgCandleProcessor } from './processors/trailingAvgCandleProcessor';
import { MarketCandleProcessor } from './processors/marketCandleProcessor';
import { ResourcePrice } from 'src/models/ResourcePrice';

export interface ResourcePriceParams {
  initialTimestamp: number;
  quantity: number;
  resourceSlug?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}

export abstract class BaseCandleCacheBuilder {
  protected runtimeCandles: RuntimeCandleStore;
  protected trailingAvgHistory: TrailingAvgHistoryStore;
  protected marketInfoStore: MarketInfoStore;
  protected resourceCandleProcessor: ResourceCandleProcessor;
  protected indexCandleProcessor: IndexCandleProcessor;
  protected trailingAvgCandleProcessor: TrailingAvgCandleProcessor;
  protected marketCandleProcessor: MarketCandleProcessor;

  // Configurable resource price fetching functions
  protected getResourcePricesCountFn: (
    params: ResourcePriceParams
  ) => Promise<number> = getResourcePricesCount;
  protected getResourcePricesFn: (
    params: ResourcePriceParams
  ) => Promise<{ prices: ResourcePrice[]; hasMore: boolean }> =
    getResourcePrices;

  protected constructor() {
    this.runtimeCandles = new RuntimeCandleStore();
    this.trailingAvgHistory = new TrailingAvgHistoryStore();
    this.marketInfoStore = MarketInfoStore.getInstance();
    this.resourceCandleProcessor = new ResourceCandleProcessor(
      this.runtimeCandles
    );
    this.indexCandleProcessor = new IndexCandleProcessor(
      this.runtimeCandles,
      this.marketInfoStore
    );
    this.trailingAvgCandleProcessor = new TrailingAvgCandleProcessor(
      this.runtimeCandles,
      this.trailingAvgHistory
    );
    this.marketCandleProcessor = new MarketCandleProcessor(
      this.runtimeCandles,
      this.marketInfoStore
    );
  }

  protected async getUpdatedMarketsAndMarketGroups() {
    const marketGroups = await getMarketGroups();
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }

  protected async processResourcePrices(initialTimestamp: number = 0) {
    log({
      message: 'step 1: process resource prices',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });

    let getNextBatch = true;

    const totalResourcePrices = await this.getResourcePricesCountFn({
      initialTimestamp,
      quantity: 0,
    });
    const totalBatches = Math.ceil(
      totalResourcePrices / CANDLE_CACHE_CONFIG.batchSize
    );
    let iter = 0;

    while (getNextBatch) {
      iter++;
      log({
        message: `batch: ${iter}/${totalBatches} - step 1: get the batch`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });

      const { prices, hasMore } = await this.getResourcePricesFn({
        initialTimestamp,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });

      getNextBatch = hasMore;
      if (prices.length === 0) {
        log({
          message: `batch is empty: ${iter}/${totalBatches} - step 2`,
          prefix: CANDLE_CACHE_CONFIG.logPrefix,
          indent: 2,
        });
        break;
      }

      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });
      const batchStartTime = Date.now();

      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];

        // Add it to the trailing avg history
        for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
          this.trailingAvgHistory.addPriceAndGetSums(
            price.resource.slug,
            trailingAvgTime,
            {
              timestamp: price.timestamp,
              used: price.used,
              fee: price.feePaid,
            }
          );
        }

        // Process the item for all candle types
        await this.resourceCandleProcessor.processResourcePrice(price);
        await this.indexCandleProcessor.processResourcePrice(price);
        for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
          await this.trailingAvgCandleProcessor.processResourcePrice(
            price,
            trailingAvgTime
          );
        }

        batchIdx++;
      }

      const batchEndTime = Date.now();
      const batchDuration = (batchEndTime - batchStartTime) / 1000;
      log({
        message: `batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });

      // Update timestamp for next batch
      initialTimestamp = prices[prices.length - 1].timestamp;
      await setParam(
        CANDLE_CACHE_CONFIG.lastProcessedResourcePrice,
        initialTimestamp
      );
    }
  }

  protected async processMarketPrices(initialTimestamp: number = 0) {
    log({
      message: 'step 1: process market prices',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });

    let getNextBatch = true;

    const totalMarketPrices = await getMarketPricesCount(initialTimestamp);
    const totalBatches = Math.ceil(
      totalMarketPrices / CANDLE_CACHE_CONFIG.batchSize
    );
    let iter = 0;

    while (getNextBatch) {
      iter++;
      log({
        message: `batch: ${iter}/${totalBatches} - step 1`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });

      const { prices, hasMore } = await getMarketPrices({
        initialTimestamp,
        quantity: CANDLE_CACHE_CONFIG.batchSize,
      });

      getNextBatch = hasMore;
      if (prices.length === 0) {
        log({
          message: `batch is empty: ${iter}/${totalBatches} - step 2`,
          prefix: CANDLE_CACHE_CONFIG.logPrefix,
          indent: 2,
        });
        break;
      }

      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });

      const batchStartTime = Date.now();
      let batchIdx = 0;
      while (batchIdx < prices.length) {
        const price = prices[batchIdx];
        await this.marketCandleProcessor.processMarketPrice(price);
        batchIdx++;
      }

      const batchEndTime = Date.now();
      const batchDuration = (batchEndTime - batchStartTime) / 1000;
      log({
        message: `batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });

      // Update timestamp for next batch
      if (prices.length > 0) {
        initialTimestamp = prices[prices.length - 1].timestamp;
        await setParam(
          CANDLE_CACHE_CONFIG.lastProcessedMarketPrice,
          initialTimestamp
        );
      }
    }
  }

  protected async saveAllRuntimeCandles() {
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
      const resourceCandles =
        this.runtimeCandles.getAllResourceCandles(resourceSlug);
      for (const candle of resourceCandles.values()) {
        await saveCandle(candle);
      }

      // Save all index candles for this resource's markets
      const marketIds =
        this.marketInfoStore.getAllMarketIndexesByResourceSlug(resourceSlug);
      for (const marketId of marketIds) {
        const indexCandles = this.runtimeCandles.getAllIndexCandles(marketId);
        for (const candle of indexCandles.values()) {
          await saveCandle(candle);
        }
      }

      // Save all trailing average candles for this resource
      for (const trailingAvgTime of CANDLE_CACHE_CONFIG.trailingAvgTime) {
        const trailingAvgCandles = this.runtimeCandles.getAllTrailingAvgCandles(
          resourceSlug,
          trailingAvgTime
        );
        for (const candle of trailingAvgCandles.values()) {
          await saveCandle(candle);
        }
      }
    }
  }
}
