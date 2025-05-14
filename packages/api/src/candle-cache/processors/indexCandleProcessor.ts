
import { ResourcePrice } from '../../models/ResourcePrice';
import { CacheCandle } from '../../models/CacheCandle';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { saveCandle } from '../dbUtils';
import { MarketInfo, MarketInfoStore } from '../marketInfoStore';

export class IndexCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: MarketInfoStore
  ) {}

  private getNewAvgPaidAndFee = (
    prevCandle: CacheCandle | undefined,
    price: ResourcePrice
  ) => {
    const feePaid = (prevCandle ? Number(prevCandle.sumFeePaid) : 0) + Number(price.feePaid);
    const used = (prevCandle ? Number(prevCandle.sumUsed) : 0) + Number(price.used);
    const avg = feePaid > 0 ? used / feePaid : 0;
    return { feePaid, used, avg };
  }

  private getNewCandle = async (
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePrice,
    marketInfo: MarketInfo,
    prevCandle: CacheCandle | undefined
  ) => {
    const { feePaid, used, avg } = this.getNewAvgPaidAndFee(prevCandle, price);

    const resource = await price.resource;
    
    const candle = new CacheCandle();
    candle.candleType = CANDLE_TYPES.INDEX;
    candle.interval = interval;
    candle.marketIdx = marketInfo.marketIdx;
    candle.resourceSlug = resource.slug;
    candle.marketId = marketInfo.marketId;
    candle.address = marketInfo.marketGroupAddress;
    candle.chainId = marketInfo.marketGroupChainId;
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


  public async processResourcePrice(
    price: ResourcePrice,
  ) {
    
    // For each market, check if the price timestamp is within the market's active period
    const resource = await price.resource;
    for (const marketIdx of this.marketInfoStore.getAllMarketIndexesByResourceSlug(resource.slug)) {
      const isMarketActive = this.marketInfoStore.isMarketActive(marketIdx, price.timestamp);

      const marketInfo = this.marketInfoStore.getMarketInfo(marketIdx);
      if (!marketInfo) {
        throw Error(`Market ${marketIdx} not found`);
      }
  
      // For each interval add the price to the candle
      for (const interval of CANDLE_CACHE_CONFIG.intervals) {
        // Calculate the start and end of the candle
        const { start: candleTimestamp, end: candleEndTimestamp } =
          getTimtestampCandleInterval(price.timestamp, interval);

        // Get existing candle or create new one
        let candle = this.runtimeCandles.getIndexCandle(marketIdx, interval);

        // If we have a candle but it's from a different period, save it and create a new one
        if (candle && candle.timestamp < candleTimestamp) {
          await saveCandle(candle);
          if (isMarketActive) {
            candle = await this.getNewCandle(
              interval,
              candleTimestamp,
              candleEndTimestamp,
              price,
              marketInfo,
              candle
            );
            this.runtimeCandles.setIndexCandle(marketIdx, interval, candle);
          }
        } else if (!candle && isMarketActive) {
          // Create new candle if none exists and market is active
          candle = await this.getNewCandle(
            interval,
            candleTimestamp,
            candleEndTimestamp,
            price,
            marketInfo, 
            undefined
          );
          this.runtimeCandles.setIndexCandle(marketIdx, interval, candle);
        } else if (candle && isMarketActive) {
          // Update existing candle
          const { feePaid, used, avg } = this.getNewAvgPaidAndFee(candle, price);
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.lastUpdatedTimestamp = price.timestamp;
          candle.sumFeePaid = String(feePaid);
          candle.sumUsed = String(used);
        }
      }
    }
  }
} 