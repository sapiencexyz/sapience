import type {
  ResourcePrice,
  CacheCandle,
  Resource,
} from '../../../generated/prisma';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { getOrCreateCandle, saveCandle } from '../dbUtils';
import { marketInfo, marketInfoStore } from '../marketInfoStore';

type ResourcePriceWithResource = ResourcePrice & { resource: Resource };

export class IndexCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: marketInfoStore
  ) {}

  private getNewAvgPaidAndFee = (
    prevCandle: CacheCandle | undefined,
    price: ResourcePriceWithResource
  ) => {
    const feePaidStr = price.feePaid;
    const usedStr = price.used;

    const prevFeePaidStr = prevCandle?.sumFeePaid || '0';
    const prevUsedStr = prevCandle?.sumUsed || '0';

    const feePaidInt = Math.floor(parseFloat(feePaidStr));
    const usedInt = Math.floor(parseFloat(usedStr));
    const prevFeePaidInt = Math.floor(parseFloat(prevFeePaidStr));
    const prevUsedInt = Math.floor(parseFloat(prevUsedStr));

    const feePaid = BigInt(prevFeePaidInt) + BigInt(feePaidInt);
    const used = BigInt(prevUsedInt) + BigInt(usedInt);
    const avg = used > 0 ? feePaid / used : 0;
    return { feePaid, used, avg };
  };

  private async getNewCandle(
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePriceWithResource,
    marketInfo: marketInfo,
    prevCandle: CacheCandle | undefined
  ): Promise<CacheCandle> {
    const { feePaid, used, avg } = this.getNewAvgPaidAndFee(prevCandle, price);

    const candle = await getOrCreateCandle({
      candleType: CANDLE_TYPES.INDEX,
      interval: interval,
      marketIdx: marketInfo.marketIdx,
      resourceSlug: price.resource.slug,
      trailingAvgTime: 0,
      timestamp: candleTimestamp,
    });

    // CANDLE VALUES
    candle.marketId = marketInfo.marketId;
    candle.address = marketInfo.marketGroupAddress;
    candle.chainId = marketInfo.marketGroupChainId;
    candle.endTimestamp = candleEndTimestamp;
    candle.lastUpdatedTimestamp = price.timestamp;
    candle.open = String(avg);
    candle.high = String(avg);
    candle.low = String(avg);
    candle.close = String(avg);
    candle.sumFeePaid = feePaid.toString();
    candle.sumUsed = used.toString();
    return candle;
  }

  public async processResourcePrice(price: ResourcePriceWithResource) {
    // For each market, check if the price timestamp is within the market's active period
    for (const marketIdx of this.marketInfoStore.getAllMarketIndexesByResourceSlug(
      price.resource.slug
    )) {
      const isMarketActive = this.marketInfoStore.isMarketActive(
        marketIdx,
        price.timestamp
      );

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
          const { feePaid, used, avg } = this.getNewAvgPaidAndFee(
            candle,
            price
          );
          candle.high = String(avg);
          candle.low = String(avg);
          candle.close = String(avg);
          candle.lastUpdatedTimestamp = price.timestamp;
          candle.sumFeePaid = feePaid.toString();
          candle.sumUsed = used.toString();
        }
      }
    }
  }
}
