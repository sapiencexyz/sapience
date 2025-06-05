import { CANDLE_CACHE_CONFIG, CANDLE_CACHE_IPC_KEYS } from './config';
import { log } from 'src/utils/logs';
import {
  BaseCandleCacheBuilder,
  ResourcePriceParams,
} from './baseCandleCacheBuilder';
import { setParam } from './dbUtils';

export class CandleCacheReBuilder extends BaseCandleCacheBuilder {
  private static instance: CandleCacheReBuilder;
  private resourceSlug?: string;
  private startTimestamp?: number;
  private endTimestamp?: number;

  private constructor() {
    super();

    // Override the resource price fetching functions to include filtering
    const originalGetResourcePricesCountFn = this.getResourcePricesCountFn;
    this.getResourcePricesCountFn = async (params: ResourcePriceParams) => {
      return originalGetResourcePricesCountFn({
        ...params,
        resourceSlug: this.resourceSlug || params.resourceSlug,
        startTimestamp: this.startTimestamp || params.startTimestamp,
        endTimestamp: this.endTimestamp || params.endTimestamp,
      });
    };

    const originalGetResourcePricesFn = this.getResourcePricesFn;
    this.getResourcePricesFn = async (params: ResourcePriceParams) => {
      return originalGetResourcePricesFn({
        ...params,
        resourceSlug: this.resourceSlug || params.resourceSlug,
        startTimestamp: this.startTimestamp || params.startTimestamp,
        endTimestamp: this.endTimestamp || params.endTimestamp,
      });
    };
  }

  // Implement the abstract method to specify the IPC key for this class
  protected getStatusIPCKey(): string {
    return CANDLE_CACHE_IPC_KEYS.candleCacheReBuilderStatus;
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheReBuilder();
    }
    return this.instance;
  }

  public async rebuildAllCandles() {
    this.resourceSlug = undefined;
    this.startTimestamp = undefined;
    this.endTimestamp = undefined;
    await this.commonRebuildCandles();
  }

  public async rebuildCandlesForResource(resourceSlug: string) {
    this.resourceSlug = resourceSlug;
    this.startTimestamp = undefined;
    this.endTimestamp = undefined;
    await this.commonRebuildCandles();
  }

  public async rebuildCandlesForRange(
    startTimestamp: number,
    endTimestamp: number
  ) {
    this.resourceSlug = undefined;
    this.startTimestamp = startTimestamp;
    this.endTimestamp = endTimestamp;
    await this.commonRebuildCandles();
  }

  private async commonRebuildCandles() {
    log({
      message: 'Starting candle rebuild',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });

    // Clean all trailing avg history
    await this.trailingAvgHistory.cleanAll(); // start fresh

    // Get updated market groups
    await this.getUpdatedMarketsAndMarketGroups();

    // Process all resource prices
    await this.processResourcePrices(0);

    // Process all market prices
    await this.processMarketPrices(0);

    // Save all runtime candles
    await this.saveAllRuntimeCandles();

    // Use IPC to notify the candle cache builder that it needs to refresh the trailing avg history
    await setParam(CANDLE_CACHE_IPC_KEYS.rebuildTrailingAvgHistory, 1);

    log({
      message: 'Finished candle rebuild',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
  }
}
