import { ResourcePrice } from 'src/models/ResourcePrice';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { saveCandle } from '../dbUtils';

export class ResourceCandleProcessor {
  constructor(private runtimeCandles: RuntimeCandleStore) {}

  private getNewCandle = (
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePrice,
    resourceSlug: string
  ) => {
    const candle = new CacheCandle();
    candle.candleType = CANDLE_TYPES.RESOURCE;
    candle.interval = interval;
    candle.resourceSlug = resourceSlug;
    candle.timestamp = candleTimestamp;
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = price.value;
    candle.high = price.value;
    candle.low = price.value;
    candle.close = price.value;
    return candle;
  };

  public async processResourcePrice(price: ResourcePrice) {
    // For each interval add the price to the candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      // Calculate the start and end of the candle
      const { start: candleTimestamp, end: candleEndTimestamp } =
        getTimtestampCandleInterval(price.timestamp, interval);

      // Get existing candle or create new one
      let candle = this.runtimeCandles.getResourceCandle(
        price.resource.slug,
        interval
      );

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
          price.resource.slug
        );
        this.runtimeCandles.setResourceCandle(
          price.resource.slug,
          interval,
          candle
        );
      } else if (!candle) {
        // Create new candle if none exists
        candle = this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,
          price.resource.slug
        );
        this.runtimeCandles.setResourceCandle(
          price.resource.slug,
          interval,
          candle
        );
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
