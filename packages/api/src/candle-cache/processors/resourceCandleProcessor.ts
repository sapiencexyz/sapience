import { ResourcePrice } from 'src/models/ResourcePrice';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { BNMax, BNMin, getTimtestampCandleInterval } from '../candleUtils';
import {
  getLatestResourcePrice,
  getOrCreateCandle,
  saveCandle,
} from '../dbUtils';

export class ResourceCandleProcessor {
  private lastClosePricesByResourceAndInterval: Record<
    string,
    Record<number, string>
  > = {};

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

    const open =
      this.lastClosePricesByResourceAndInterval[resourceSlug][interval] ??
      price.value;

    // CANDLE VALUES
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = open;
    candle.high = BNMax(open, price.value);
    candle.low = BNMin(open, price.value);
    candle.close = price.value;
    return candle;
  }

  public async processResourcePrice(price: ResourcePrice) {
    // For each interval add the price to the candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      if (!this.lastClosePricesByResourceAndInterval[price.resource.slug]) {
        this.lastClosePricesByResourceAndInterval[price.resource.slug] = {};
      }
      if (
        !this.lastClosePricesByResourceAndInterval[price.resource.slug][
          interval
        ]
      ) {
        // Get the last known price to use as initial price
        const lastPrice = await getLatestResourcePrice(
          price.timestamp,
          price.resource.slug
        );
        if (lastPrice) {
          this.lastClosePricesByResourceAndInterval[price.resource.slug][
            interval
          ] = lastPrice.value.toString();
        } else {
          this.lastClosePricesByResourceAndInterval[price.resource.slug][
            interval
          ] = price.value.toString();
        }
      }

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
        this.lastClosePricesByResourceAndInterval[price.resource.slug][
          interval
        ] = candle.close.toString();
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
        candle.high = BNMax(candle.high, price.value);
        candle.low = BNMin(candle.low, price.value);
        candle.close = price.value;
        candle.lastUpdatedTimestamp = price.timestamp;
      }
    }
  }
}
