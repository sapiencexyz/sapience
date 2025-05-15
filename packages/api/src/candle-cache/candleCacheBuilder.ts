import { getParam } from './dbUtils';
import { CANDLE_CACHE_CONFIG } from './config';
import { log } from 'src/utils/logs';
import { BaseCandleCacheBuilder } from './baseCandleCacheBuilder';

export class CandleCacheBuilder extends BaseCandleCacheBuilder {
  private static instance: CandleCacheBuilder;

  private constructor() {
    super();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheBuilder();
    }
    return this.instance;
  }

  public async buildAllCandles() {
    log({
      message: 'step 1: get updated markets and market groups',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    await this.getUpdatedMarketsAndMarketGroups();

    log({
      message: 'step 2: process resource prices',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    const lastProcessedResourcePrice = await getParam(
      CANDLE_CACHE_CONFIG.lastProcessedResourcePrice
    );
    await this.processResourcePrices(lastProcessedResourcePrice);

    log({
      message: 'step 3: process market prices',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    const lastProcessedMarketPrice = await getParam(
      CANDLE_CACHE_CONFIG.lastProcessedMarketPrice
    );
    await this.processMarketPrices(lastProcessedMarketPrice);

    log({
      message: 'step 4: save all runtime candles',
      prefix: CANDLE_CACHE_CONFIG.logPrefix,
    });
    await this.saveAllRuntimeCandles();

    log({ message: 'step 5: done', prefix: CANDLE_CACHE_CONFIG.logPrefix });
  }
}
