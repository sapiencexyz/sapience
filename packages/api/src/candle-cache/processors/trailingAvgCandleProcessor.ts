
import { ResourcePrice } from '../../models/ResourcePrice';
import { CacheCandle } from '../../models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { saveCandle } from '../dbUtils';
import { TrailingAvgHistoryStore } from '../trailingAvgHistoryStore';
import { startOfInterval, startOfNextInterval } from '../candleUtils';

export class TrailingAvgCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private trailingAvgHistory: TrailingAvgHistoryStore
  ) {}

  private getNewCandle = async (
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePrice,
    trailingAvgTime: number,
    sumUsed: bigint,
    sumFeePaid: bigint,
    startOfTrailingWindow: number
  ): Promise<CacheCandle> => {
    const resource = await price.resource;
    const candle = new CacheCandle();
    const avg = sumUsed > 0n ? sumFeePaid / sumUsed : 0n;

    candle.candleType = CANDLE_TYPES.TRAILING_AVG;
    candle.interval = interval;
    candle.resourceSlug = resource.slug;
    candle.timestamp = candleTimestamp;
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = avg.toString();
    candle.high = avg.toString();
    candle.low = avg.toString();
    candle.close = avg.toString();
    candle.sumUsed = sumUsed.toString();
    candle.sumFeePaid = sumFeePaid.toString();
    candle.trailingStartTimestamp = startOfTrailingWindow;
    candle.trailingAvgTime = trailingAvgTime;
    return candle;
  }

  public async processResourcePrice(
    price: ResourcePrice,
    trailingAvgTime: number
  ) {
    const resource = await price.resource;
    // Add the new price to history and get the updated sums
    const { sumUsed, sumFeePaid, startOfTrailingWindow } = this.trailingAvgHistory.getSums (
      resource.slug,
      trailingAvgTime
    );

    // For each interval, update the trailing average candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      const candleTimestamp = startOfInterval(price.timestamp, interval);
      const candleEndTimestamp = startOfNextInterval(price.timestamp, interval);

      let candle = this.runtimeCandles.getTrailingAvgCandle(
        resource.slug,
        interval,
        trailingAvgTime
      );

      // If no candle exists or we're starting a new interval
      if (!candle || candle.timestamp < candleTimestamp) {
        // Save existing candle if it exists
        if (candle) {
          await saveCandle(candle);
        }

        // Create new candle
        candle = await this.getNewCandle(
          interval,
          candleTimestamp,
          candleEndTimestamp,
          price,  
          trailingAvgTime,
          sumUsed,
          sumFeePaid,
          startOfTrailingWindow
        );
      } else {
        // Update existing candle
        const avg = sumUsed > 0n ? sumFeePaid / sumUsed : 0n;
        candle.open = avg.toString();
        candle.high = avg.toString();
        candle.low = avg.toString();
        candle.close = avg.toString();
        candle.sumUsed = sumUsed.toString();
        candle.sumFeePaid = sumFeePaid.toString();
        candle.trailingStartTimestamp = startOfTrailingWindow;
        candle.lastUpdatedTimestamp = price.timestamp;
      }

      // Store the candle in runtime
      this.runtimeCandles.setTrailingAvgCandle(
        resource.slug,
        interval,
        trailingAvgTime,
        candle
      );
    }
  }
} 