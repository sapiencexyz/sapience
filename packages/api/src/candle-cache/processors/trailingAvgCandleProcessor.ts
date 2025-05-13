import { ResourcePrice } from 'src/models/ResourcePrice';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { saveCandle } from '../dbUtils';
import { TrailingAvgHistoryStore } from '../trailingAvgHistoryStore';

export class TrailingAvgCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private trailingAvgHistory: TrailingAvgHistoryStore
  ) {}

  public async processResourcePrice(
    price: ResourcePrice,
    trailingAvgTime: number,
    isLast: boolean
  ) {
    const getNewCandle = (
      interval: number,
      candleTimestamp: number,
      candleEndTimestamp: number,
      price: ResourcePrice,
      resourceSlug: string
    ) => {
      const candle = new CacheCandle();
      candle.candleType = CANDLE_TYPES.TRAILING_AVG;
      candle.interval = interval;
      candle.resourceSlug = resourceSlug;
      return candle;
    };

    // Get the prices for this trailing average period
    const prices = this.trailingAvgHistory.getPricesForTrailingAvg(
      price.resource.slug,
      trailingAvgTime
    );

    // Calculate the trailing average
    if (prices.length > 0) {
      const sum = prices.reduce((acc, p) => acc + Number(p.used), 0);
      const avg = sum / prices.length;

      // For each interval, update the trailing average candle
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        const candleTimestamp =
          Math.floor(price.timestamp / interval) * interval;

        let candle = this.runtimeCandles.getTrailingAvgCandle(
          price.resource.slug,
          interval,
          trailingAvgTime
        );

        if (!candle) {
          candle = new CacheCandle();
          candle.candleType = CANDLE_TYPES.TRAILING_AVG;
          candle.interval = interval;
          candle.resourceSlug = price.resource.slug;
          candle.timestamp = candleTimestamp;
          candle.open = String(avg);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.sumUsed = '0';
          candle.sumFeePaid = '0';
          candle.trailingStartTimestamp = prices[0].timestamp;
          candle.trailingAvgTime = trailingAvgTime;
        } else if (candle.timestamp < candleTimestamp) {
          await saveCandle(candle);

          candle = new CacheCandle();
          candle.candleType = CANDLE_TYPES.TRAILING_AVG;
          candle.interval = interval;
          candle.resourceSlug = price.resource.slug;
          candle.timestamp = candleTimestamp;
          candle.open = String(avg);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.sumUsed = '0';
          candle.sumFeePaid = '0';
          candle.trailingStartTimestamp = prices[0].timestamp;
          candle.trailingAvgTime = trailingAvgTime;
        } else {
          candle.high = String(Math.max(Number(candle.high), avg));
          candle.low = String(Math.min(Number(candle.low), avg));
          candle.close = String(avg);
        }

        this.runtimeCandles.setTrailingAvgCandle(
          price.resource.slug,
          interval,
          trailingAvgTime,
          candle
        );

        // Save the candle if it's the last item in the batch
        if (isLast) {
          await saveCandle(candle);
        }
      }
    }
  }
} 