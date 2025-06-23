import { ReducedMarketPrice } from '../types';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { BNMax, BNMin, getTimtestampCandleInterval } from '../candleUtils';
import {
  getLatestMarketPrice,
  getOrCreateCandle,
  saveCandle,
} from '../dbUtils';
import { MarketInfo, MarketInfoStore } from '../marketInfoStore';

export class MarketCandleProcessor {
  private lastClosePricesByMarketAndInterval: Record<
    number,
    Record<number, string>
  > = {};

  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: MarketInfoStore
  ) {}

  private async getNewCandle(
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ReducedMarketPrice,
    marketInfo: MarketInfo
  ): Promise<CacheCandle> {
    const candle = await getOrCreateCandle({
      candleType: CANDLE_TYPES.MARKET,
      interval: interval,
      marketIdx: price.market,
      resourceSlug: marketInfo.resourceSlug,
      trailingAvgTime: 0,
      timestamp: candleTimestamp,
    });

    const open =
      this.lastClosePricesByMarketAndInterval[price.market][interval] ??
      price.value;

    // CANDLE VALUES
    candle.marketId = price.market;
    candle.address = marketInfo.marketGroupAddress;
    candle.chainId = marketInfo.marketGroupChainId;
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = open;
    candle.high = BNMax(open, price.value);
    candle.low = BNMin(open, price.value);
    candle.close = price.value;
    candle.marketId = price.market;
    return candle;
  }

  public async processMarketPrice(price: ReducedMarketPrice) {
    // Find the market data from marketIds using price.market
    const marketInfo = this.marketInfoStore.getMarketInfo(price.market);
    if (!marketInfo) {
      throw Error(`Market ${price.market} not found`);
    }

    // For each interval add the price to the candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      if (!this.lastClosePricesByMarketAndInterval[price.market]) {
        this.lastClosePricesByMarketAndInterval[price.market] = {};
      }
      if (!this.lastClosePricesByMarketAndInterval[price.market][interval]) {
        // Get the last known price to use as initial price
        const lastPrice = await getLatestMarketPrice(
          price.timestamp,
          price.market
        );
        if (lastPrice) {
          this.lastClosePricesByMarketAndInterval[price.market][interval] =
            lastPrice.value;
        } else {
          this.lastClosePricesByMarketAndInterval[price.market][interval] =
            price.value;
        }
      }

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
        this.lastClosePricesByMarketAndInterval[price.market][interval] =
          candle.close;
        await saveCandle(candle);
        candle = await this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketInfo
        );
        this.runtimeCandles.setMarketCandle(price.market, interval, candle);
      } else if (!candle) {
        // Create new candle if none exists
        candle = await this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          marketInfo
        );
        this.runtimeCandles.setMarketCandle(price.market, interval, candle);
      } else {
        // Update existing candle
        candle.high = BNMax(candle.high, price.value);
        candle.low = BNMin(candle.low, price.value);
        candle.close = price.value;
        candle.lastUpdatedTimestamp = price.timestamp;
      }
    }
  }
}
