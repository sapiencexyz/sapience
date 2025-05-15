import { MarketGroup } from "src/models/MarketGroup";
import { CANDLE_CACHE_CONFIG } from "./config";
import { log } from 'src/utils/logs';
import { BaseCandleCacheBuilder, ResourcePriceParams } from './baseCandleCacheBuilder';

export class CandleCacheReBuilder extends BaseCandleCacheBuilder {
  private static instance: CandleCacheReBuilder;
  private resourceSlug?: string;
  private startTimestamp?: number;
  private endTimestamp?: number;

  private constructor(resourceSlug?: string, startTimestamp?: number, endTimestamp?: number) {
    super();
    this.resourceSlug = resourceSlug;
    this.startTimestamp = startTimestamp;
    this.endTimestamp = endTimestamp;

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

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheReBuilder();
    }
    return this.instance;
  }

  public async rebuildAllCandles() {
    log({ message: 'Starting candle rebuild', prefix: CANDLE_CACHE_CONFIG.logPrefix });

    // Get updated market groups
    await this.getUpdatedMarketsAndMarketGroups();

    // Process all resource prices
    await this.processResourcePrices(0);

    // Process all market prices
    await this.processMarketPrices(0);

    // Save all runtime candles
    await this.saveAllRuntimeCandles();

    log({ message: 'Finished candle rebuild', prefix: CANDLE_CACHE_CONFIG.logPrefix });
  }

  public async rebuildCandlesForResource(resourceSlug: string) {
    this.resourceSlug = resourceSlug;
    await this.rebuildAllCandles();
  }

  public async rebuildCandlesForMarketGroup(marketGroup: MarketGroup) {
  }

  public async rebuildCandlesForRange(startTimestamp: number, endTimestamp: number) {
    this.startTimestamp = startTimestamp;
    this.endTimestamp = endTimestamp;
    await this.rebuildAllCandles();
  }
}
