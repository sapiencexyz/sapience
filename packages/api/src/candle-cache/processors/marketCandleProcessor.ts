import { ReducedMarketPrice } from '../types';
import { CacheCandle } from '../../models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { saveCandle } from '../dbUtils';
import { MarketInfo, MarketInfoStore } from '../marketInfoStore';

export class MarketCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: MarketInfoStore
  ) {}

  private getNewCandle = (
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ReducedMarketPrice,
    marketInfo: MarketInfo
  ) => {
    const candle = new CacheCandle();
    candle.candleType = CANDLE_TYPES.MARKET;
    candle.interval = interval;
    candle.marketIdx = price.market;
    candle.resourceSlug = marketInfo.resourceSlug;
    candle.marketId = price.market;
    candle.resourceSlug = marketInfo.resourceSlug;
    candle.address = marketInfo.marketGroupAddress;
    candle.chainId = marketInfo.marketGroupChainId;
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

  public async processMarketPrice(price: ReducedMarketPrice) {
    // Find the market data from marketIds using price.market
    const marketInfo = this.marketInfoStore.getMarketInfo(price.market);
    if (!marketInfo) {
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
        candle = this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketInfo
        );
        this.runtimeCandles.setMarketCandle(price.market, interval, candle);
      } else if (!candle) {
        // Create new candle if none exists
        candle = this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketInfo
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
    }
  }
}
