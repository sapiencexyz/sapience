import { CANDLE_CACHE_CONFIG, CANDLE_CACHE_IPC_KEYS } from './config';
import {
  getMarketGroups,
  getMarketPrices,
  getResourcePrices,
  setParam,
  saveCandle,
  getResourcePricesCount,
  getMarketPricesCount,
  truncateCandlesTable,
  truncateParamsTable,
  setStringParam,
  getStringParam,
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

export enum CandleCacheReBuilderStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
}

export abstract class BaseCandleCacheBuilder {
  protected runtimeCandles: RuntimeCandleStore;
  protected trailingAvgHistory: TrailingAvgHistoryStore;
  protected marketInfoStore: MarketInfoStore;
  protected resourceCandleProcessor: ResourceCandleProcessor;
  protected indexCandleProcessor: IndexCandleProcessor;
  protected trailingAvgCandleProcessor: TrailingAvgCandleProcessor;
  protected marketCandleProcessor: MarketCandleProcessor;
  private status: CandleCacheReBuilderStatus = CandleCacheReBuilderStatus.IDLE;
  private description: string = '';

  // Configurable resource price fetching functions
  protected getResourcePricesCountFn: (
    params: ResourcePriceParams
  ) => Promise<number> = getResourcePricesCount;
  protected getResourcePricesFn: (
    params: ResourcePriceParams
  ) => Promise<{ prices: ResourcePrice[]; hasMore: boolean }> =
    getResourcePrices;

  // Abstract method that derived classes must implement to specify their IPC key
  protected abstract getStatusIPCKey(): string;

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

  private async updateStatusInIPC(): Promise<void> {
    try {
      // Get existing process status to preserve process information
      const statusKey = this.getStatusIPCKey();
      const existingStatusString = await getStringParam(statusKey);
      let processStatus: any = {
        isActive: false,
        builderStatus: {
          status: this.status,
          description: this.description,
          timestamp: Date.now(),
        },
      };

      if (existingStatusString) {
        try {
          processStatus = JSON.parse(existingStatusString);
          // Update only the builder status while preserving other fields
          processStatus.builderStatus = {
            status: this.status,
            description: this.description,
            timestamp: Date.now(),
          };
        } catch (parseError) {
          log({
            message: `Failed to parse existing status, creating new: ${parseError}`,
            prefix: CANDLE_CACHE_CONFIG.logPrefix,
          });
        }
      }
      
      await setStringParam(statusKey, JSON.stringify(processStatus));
    } catch (error) {
      log({
        message: `Failed to update status in IPC: ${error}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
      });
    }
  }

  private async setStatus(status: CandleCacheReBuilderStatus, description: string): Promise<void> {
    this.status = status;
    this.description = description;
    await this.updateStatusInIPC();
  }

  protected async getUpdatedMarketsAndMarketGroups() {
    const marketGroups = await getMarketGroups();
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }

  protected async processResourcePrices(initialTimestamp: number = 0) {
    let getNextBatch = true;

    const correctedInitialTimestamp = this.trailingAvgHistory.isEmpty()
      ? Math.max(initialTimestamp - CANDLE_CACHE_CONFIG.preTrailingAvgTime, 0)
      : initialTimestamp;
    log({
      message: `step 1: process resource prices from ${correctedInitialTimestamp} (${initialTimestamp})`,
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    
    await this.setStatus(
      CandleCacheReBuilderStatus.PROCESSING,
      `process resource prices from ${correctedInitialTimestamp} (${initialTimestamp})`
    );
    
    initialTimestamp = correctedInitialTimestamp;

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
        message: `batch: ${iter}/${totalBatches} - step 1`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `resource prices batch: ${iter}/${totalBatches} - step 1`
      );

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
        
        await this.setStatus(
          CandleCacheReBuilderStatus.PROCESSING,
          `resource prices batch is empty: ${iter}/${totalBatches} - step 2`
        );
        break;
      }

      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `resource prices batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`
      );

      const batchStartTime = Date.now();
      let batchIdx = 0;
      let lastLogTime = Date.now();

      while (batchIdx < prices.length) {
        if (Date.now() - lastLogTime > CANDLE_CACHE_CONFIG.batchLogInterval) {
          log({
            message: `batch: ${iter}/${totalBatches} - step 2: processing the batch of size: ${prices.length} - ${batchIdx}/${prices.length}`,
            prefix: CANDLE_CACHE_CONFIG.logPrefix,
            indent: 4,
          });
          
          await this.setStatus(
            CandleCacheReBuilderStatus.PROCESSING,
            `resource prices batch: ${iter}/${totalBatches} - step 2: processing the batch of size: ${prices.length} - ${batchIdx}/${prices.length}`
          );
          lastLogTime = Date.now();
        }
        const price = prices[batchIdx];

        // Add it to the trailing avg history
        this.trailingAvgHistory.addPrice(
          price.resource.slug,
          {
            timestamp: price.timestamp,
            used: price.used,
            fee: price.feePaid,
          },
          CANDLE_CACHE_CONFIG.trailingAvgTime
        );

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
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `resource prices batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`
      );

      // Update timestamp for next batch
      initialTimestamp = prices[prices.length - 1].timestamp;
      await setParam(
        CANDLE_CACHE_IPC_KEYS.lastProcessedResourcePrice,
        initialTimestamp
      );
    }
    
    await this.setStatus(
      CandleCacheReBuilderStatus.IDLE,
      'resource prices processing completed'
    );
  }

  protected async processMarketPrices(initialTimestamp: number = 0) {
    log({
      message: 'step 1: process market prices',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    
    await this.setStatus(
      CandleCacheReBuilderStatus.PROCESSING,
      `process market prices`
    );
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
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `market prices batch: ${iter}/${totalBatches} - step 1`
      );

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
        
        await this.setStatus(
          CandleCacheReBuilderStatus.PROCESSING,
          `market prices batch is empty: ${iter}/${totalBatches} - step 2`
        );
        break;
      }

      log({
        message: `batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`,
        prefix: CANDLE_CACHE_CONFIG.logPrefix,
        indent: 2,
      });
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `market prices batch: ${iter}/${totalBatches} - step 2, process the batch of size: ${prices.length}`
      );

      const batchStartTime = Date.now();
      let batchIdx = 0;
      let lastLogTime = Date.now();
      while (batchIdx < prices.length) {
        if (Date.now() - lastLogTime > CANDLE_CACHE_CONFIG.batchLogInterval) {
          log({
            message: `batch: ${iter}/${totalBatches} - step 2: processing the batch of size: ${prices.length} - ${batchIdx}/${prices.length}`,
            prefix: CANDLE_CACHE_CONFIG.logPrefix,
            indent: 4,
          });
          
          await this.setStatus(
            CandleCacheReBuilderStatus.PROCESSING,
            `market prices batch: ${iter}/${totalBatches} - step 2: processing the batch of size: ${prices.length} - ${batchIdx}/${prices.length}`
          );
          lastLogTime = Date.now();
        }
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
      
      await this.setStatus(
        CandleCacheReBuilderStatus.PROCESSING,
        `market prices batch: ${iter}/${totalBatches} - step 3: done processing the batch in ${batchDuration} seconds`
      );

      // Update timestamp for next batch
      if (prices.length > 0) {
        initialTimestamp = prices[prices.length - 1].timestamp;
        await setParam(
          CANDLE_CACHE_IPC_KEYS.lastProcessedMarketPrice,
          initialTimestamp
        );
      }
    }
    
    await this.setStatus(
      CandleCacheReBuilderStatus.IDLE,
      'market prices processing completed'
    );
  }

  protected async saveAllRuntimeCandles() {
    await this.setStatus(
      CandleCacheReBuilderStatus.PROCESSING,
      'save all runtime candles'
    );
    
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
    
    await this.setStatus(
      CandleCacheReBuilderStatus.IDLE,
      'save all runtime candles completed'
    );
  }

  protected async hardRefresh() {
    await truncateCandlesTable();
    await truncateParamsTable();

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

  public getStatus() {
    return {
      status: this.status,
      description: this.description,
    };
  }
}
