import { CANDLE_CACHE_CONFIG } from "./config";

export class CandleCacheReBuilder {
  private static instance: CandleCacheReBuilder;

  private config: typeof CANDLE_CACHE_CONFIG;

  private constructor() {
    this.config = CANDLE_CACHE_CONFIG;
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheReBuilder();
    }
    return this.instance;
  }

  public async updateCandlesFromMissing() {
    await this.getUpdatedMarketsAndMarketGroups();
    await this.processResourcePrices();
    await this.processMarketPrices();
  }

  private async getUpdatedMarketsAndMarketGroups() {
    // 1. get all market groups
    // 2. check if there are new market groups and prepare them for processing
    // 3. get all markets
    // 4. check if there are new markets and prepare them for processing
  }

  private async processResourcePrices() {
    // 1. get the last processed resource price
    // 2. process by batches from last processed resource price to the latest resource price
    // 3. save the candles to the database
    // 4. update the last processed resource price
  }

  private async processMarketPrices() {
    // 1. get the last processed market price
    // 2. process by batches from last processed market price to the latest market price
    // 3. save the candles to the database
    // 4. update the last processed market price
  }
}
