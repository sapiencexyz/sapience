import type {
  resource_price,
  cache_candle,
  resource,
} from '../../../generated/prisma';
import { CANDLE_TYPES, CANDLE_CACHE_CONFIG } from '../config';
import { RuntimeCandleStore } from '../runtimeCandleStore';
import { getTimtestampCandleInterval } from '../candleUtils';
import { getOrCreateCandle, saveCandle } from '../dbUtils';
import { MarketInfo, MarketInfoStore } from '../marketInfoStore';
import { Decimal } from '@prisma/client/runtime/library';

type ResourcePriceWithResource = resource_price & { resource: resource };

export class IndexCandleProcessor {
  constructor(
    private runtimeCandles: RuntimeCandleStore,
    private marketInfoStore: MarketInfoStore
  ) {}

  private getNewAvgPaidAndFee = (
    prevCandle: cache_candle | undefined,
    price: ResourcePriceWithResource
  ) => {
    const feePaid =
      (prevCandle && prevCandle.sumFeePaid
        ? BigInt(prevCandle.sumFeePaid.toString())
        : BigInt(0)) + BigInt(price.feePaid.toString());
    const used =
      (prevCandle && prevCandle.sumUsed
        ? BigInt(prevCandle.sumUsed.toString())
        : BigInt(0)) + BigInt(price.used.toString());
    const avg = used > 0 ? feePaid / used : 0;
    return { feePaid, used, avg };
  };

  private async getNewCandle(
    interval: number,
    candleTimestamp: number,
    candleEndTimestamp: number,
    price: ResourcePriceWithResource,
    marketInfo: MarketInfo,
    prevCandle: cache_candle | undefined
  ): Promise<cache_candle> {
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
    candle.sumFeePaid = new Decimal(feePaid.toString());
    candle.sumUsed = new Decimal(used.toString());
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
          candle.sumFeePaid = new Decimal(feePaid.toString());
          candle.sumUsed = new Decimal(used.toString());
        }
      }
    }
  }
}
