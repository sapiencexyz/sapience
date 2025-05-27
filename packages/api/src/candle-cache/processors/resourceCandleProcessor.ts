import { ResourcePrice } from 'src/models/ResourcePrice';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { getOrCreateCandle, saveCandle } from '../dbUtils';

export class ResourceCandleProcessor {
  constructor(private runtimeCandles: RuntimeCandleStore) {}

  private async getNewCandle(
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePrice,
    resourceSlug: string
  ): Promise<CacheCandle> {
    const candle = await getOrCreateCandle({
      candleType: CANDLE_TYPES.RESOURCE,
      interval: interval,
      marketIdx: 0,
      resourceSlug: resourceSlug,
      trailingAvgTime: 0,
      timestamp: candleTimestamp,
    });

    // CANDLE VALUES
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = price.value;
    candle.high = price.value;
    candle.low = price.value;
    candle.close = price.value;
    return candle;
  }

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
        candle = await this.getNewCandle(
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
        candle = await this.getNewCandle(
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
