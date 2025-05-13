import { ResourcePrice } from 'src/models/ResourcePrice';
import { CacheCandle } from 'src/models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { saveCandle } from '../dbUtils';
import { MarketInfoStore } from '../marketInfoStore';

export class IndexCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: MarketInfoStore
  ) {}

  public async processResourcePrice(
    price: ResourcePrice,
    isLast: boolean
  ) {
    const getNewAvgPaidAndFee = (
      prevCandle: CacheCandle | undefined,
      price: ResourcePrice
    ) => {
      const feePaid = (prevCandle ? Number(prevCandle.sumFeePaid) : 0) + Number(price.feePaid);
      const used = (prevCandle ? Number(prevCandle.sumUsed) : 0) + Number(price.used);
      const avg = feePaid > 0 ? used / feePaid : 0;
      return { feePaid, used, avg };
    }
    
    const getNewCandle = (
      interval: number,
      candleTimestamp: number,
      candleEndTimestamp: number,
      price: ResourcePrice,
      marketIdx: number,
      prevCandle: CacheCandle | undefined
    ) => {
      const { feePaid, used, avg } = getNewAvgPaidAndFee(prevCandle, price);
      
      const candle = new CacheCandle();
      candle.candleType = CANDLE_TYPES.INDEX;
      candle.interval = interval;
      candle.marketIdx = marketIdx;
      candle.resourceSlug = price.resource.slug;
      candle.timestamp = candleTimestamp;
      candle.endTimestamp = candleEndTimestamp;
      candle.lastUpdatedTimestamp = price.timestamp;
      candle.open = String(avg);
      candle.high = String(avg);
      candle.low = String(avg);
      candle.close = String(avg);
      candle.sumFeePaid = String(feePaid);
      candle.sumUsed = String(used);
      return candle;
    };

    // For each market, check if the price timestamp is within the market's active period
    for (const marketId of this.marketInfoStore.getAllMarketIndexesByResourceSlug(price.resource.slug)) {
      const isMarketActive = this.marketInfoStore.isMarketActive(marketId, price.timestamp);

      // For each interval add the price to the candle
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        // Calculate the start and end of the candle
        const { start: candleTimestamp, end: candleEndTimestamp } =
          getTimtestampCandleInterval(price.timestamp, interval);

        // Get existing candle or create new one
        let candle = this.runtimeCandles.getIndexCandle(marketId, interval);

        // If we have a candle but it's from a different period, save it and create a new one
        if (candle && candle.timestamp < candleTimestamp) {
          await saveCandle(candle);
          if (isMarketActive) {
            candle = getNewCandle(
              interval,
              candleTimestamp,
              candleEndTimestamp,
              price,
              marketId,
              candle
            );
            this.runtimeCandles.setIndexCandle(marketId, interval, candle);
          }
        } else if (!candle && isMarketActive) {
          // Create new candle if none exists and market is active
          candle = getNewCandle(
            interval,
            candleTimestamp,
            candleEndTimestamp,
            price,
            marketId, 
            undefined
          );
          this.runtimeCandles.setIndexCandle(marketId, interval, candle);
        } else if (candle && isMarketActive) {
          // Update existing candle if market is active
          const { feePaid, used, avg } = getNewAvgPaidAndFee(candle, price);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.lastUpdatedTimestamp = price.timestamp;
          candle.sumFeePaid = String(feePaid);
          candle.sumUsed = String(used);
        }

        // Save the candle if it's the last item in the batch or if the market just became inactive
        if (isLast || (candle && !isMarketActive && candle.lastUpdatedTimestamp < price.timestamp)) {
          if(candle) {
            await saveCandle(candle);
          }
        }
      }
    }
  }
} 