import type {
  resource_price,
  cache_candle,
  resource,
} from '../../../generated/prisma';

type ResourcePriceWithResource = resource_price & { resource: resource };
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getOrCreateCandle, saveCandle } from '../dbUtils';
import { TrailingAvgHistoryStore } from '../trailingAvgHistoryStore';
import { startOfInterval, startOfNextInterval } from '../candleUtils';
import { Decimal } from '@prisma/client/runtime/library';

export class TrailingAvgCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private trailingAvgHistory: TrailingAvgHistoryStore
  ) {}

  private async getNewCandle(
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePriceWithResource,
    trailingAvgTime: number,
    sumUsed: bigint,
    sumFeePaid: bigint,
    startOfTrailingWindow: number
  ): Promise<cache_candle> {
    const candle = await getOrCreateCandle({
      candleType: CANDLE_TYPES.TRAILING_AVG,
      interval: interval,
      marketIdx: 0,
      resourceSlug: price.resource.slug,
      trailingAvgTime: trailingAvgTime,
      timestamp: candleTimestamp,
    });

    const avg = sumUsed > 0n ? sumFeePaid / sumUsed : 0n;

    // CANDLE VALUES
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = avg.toString();
    candle.high = avg.toString();
    candle.low = avg.toString();
    candle.close = avg.toString();
    candle.sumUsed = new Decimal(sumUsed.toString());
    candle.sumFeePaid = new Decimal(sumFeePaid.toString());
    candle.trailingStartTimestamp = startOfTrailingWindow;
    return candle;
  }

  public async processResourcePrice(
    price: ResourcePriceWithResource,
    trailingAvgTime: number
  ) {
    // Add the new price to history and get the updated sums
    const { sumUsed, sumFeePaid, startOfTrailingWindow } =
      this.trailingAvgHistory.getSums(price.resource.slug, trailingAvgTime);

    // For each interval, update the trailing average candle
    for (const interval of CANDLE_CACHE_CONFIG.intervals) {
      const candleTimestamp = startOfInterval(price.timestamp, interval);
      const candleEndTimestamp = startOfNextInterval(price.timestamp, interval);

      let candle = this.runtimeCandles.getTrailingAvgCandle(
        price.resource.slug,
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
        candle.sumUsed = new Decimal(sumUsed.toString());
        candle.sumFeePaid = new Decimal(sumFeePaid.toString());
        candle.trailingStartTimestamp = startOfTrailingWindow;
        candle.lastUpdatedTimestamp = price.timestamp;
      }

      // Store the candle in runtime
      if (candle) {
        this.runtimeCandles.setTrailingAvgCandle(
          price.resource.slug,
          interval,
          trailingAvgTime,
          candle
        );
      }
    }
  }
}
