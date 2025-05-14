import { ResponseCandleData } from "./types";
import { CANDLE_CACHE_CONFIG, CANDLE_TYPES } from "./config";
import { getTimeWindow } from "./candleUtils";
import { getCandles, getMarketGroups } from "./dbUtils";
import { CacheCandle } from "src/models/CacheCandle";
import { MarketInfoStore } from "./marketInfoStore";

export class CandleCacheRetrieve {
  private static instance: CandleCacheRetrieve;
  private marketInfoStore: MarketInfoStore;
  private lastUpdateTimestamp: number;

  private constructor() {
    this.marketInfoStore = MarketInfoStore.getInstance();
    this.lastUpdateTimestamp = 0;
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheRetrieve();
    }
    return this.instance;
  }

  async getResourcePrices(resourceId: string, from: number, to: number, interval: number): Promise<{data: ResponseCandleData[], lastUpdateTimestamp: number}> {
    this.checkInterval(interval);
    const {from: allignedFrom, to: allignedTo} = getTimeWindow(from, to, interval);

    const candles = await getCandles({
      resourceId,
      interval,
      candleType: CANDLE_TYPES.RESOURCE,
      from: allignedFrom,
      to: allignedTo,
    }); 

    return this.getAndFillResponseCandles({
      candles,
      isCumulative: false,
      fillMissingCandles: false,
    });
  }

  async getIndexPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    marketId: string
  ) {
    this.checkInterval(interval);
    await this.getUpdatedMarketsAndMarketGroupsIfNeeded();
    const marketInfo = this.marketInfoStore.getMarketInfoByChainAndAddress(chainId, address, marketId);
    if (!marketInfo) {
      throw new Error(`Market not found for chainId: ${chainId}, address: ${address}, marketId: ${marketId}`);
    }

    const {from: allignedFrom, to: allignedTo} = getTimeWindow(from, to, interval);

    const candles = await getCandles({  
      marketIdx: marketInfo.marketIdx,
      interval,
      candleType: CANDLE_TYPES.INDEX,
      from: allignedFrom,
      to: allignedTo,
    }); 

    return this.getAndFillResponseCandles({
      candles,
      isCumulative: marketInfo.isCumulative,
      fillMissingCandles: false,
    });
  }

  async getTrailingAvgPrices(
    resourceId: string,
    from: number,
    to: number,
    interval: number,
    trailingAvgTime: number
  ) {
    this.checkInterval(interval);

    const candles = await getCandles({
      resourceId,
      interval,
      trailingAvgTime,
      candleType: CANDLE_TYPES.TRAILING_AVG,
      from,
      to,
    }); 

    return this.getAndFillResponseCandles({
      candles,
      isCumulative: false,
      fillMissingCandles: false,
    });
  }

  async getMarketPrices(
    from: number,
    to: number,
    interval: number,
    chainId: number,
    address: string,
    marketId: string
  ) {
    this.checkInterval(interval);
    await this.getUpdatedMarketsAndMarketGroupsIfNeeded();
    const marketInfo = this.marketInfoStore.getMarketInfoByChainAndAddress(chainId, address, marketId);
    if (!marketInfo) {
      throw new Error(`Market not found for chainId: ${chainId}, address: ${address}, marketId: ${marketId}`);
    }

    const candles = await getCandles({
      marketIdx: marketInfo.marketIdx,
      interval,
      candleType: CANDLE_TYPES.MARKET,
      from,
      to,
    }); 

    return this.getAndFillResponseCandles({
      candles,
      isCumulative: marketInfo.isCumulative,
      fillMissingCandles: true,
    });
  }

  private checkInterval(interval: number) {
    if (!CANDLE_CACHE_CONFIG.intervals.includes(interval)) {
      throw new Error(
        `Invalid interval: ${interval}. Must be one of: ${CANDLE_CACHE_CONFIG.intervals.join(', ')}`
      );
    }
  }

  private async getAndFillResponseCandles({
    candles,
    isCumulative,
    fillMissingCandles,
  }: {
    candles: CacheCandle[];
    isCumulative: boolean;
    fillMissingCandles: boolean;
  }): Promise<{data: ResponseCandleData[], lastUpdateTimestamp: number}> {
    if (!candles || candles.length === 0) {
      return {data: [], lastUpdateTimestamp: 0};
    }

    const timeWindow = getTimeWindow(candles[0].timestamp, candles[candles.length - 1].timestamp, candles[0].interval);
    const outputEntries: ResponseCandleData[] = [];

    // Create empty entries for the entire time window
    for (let t = timeWindow.from; t < timeWindow.to; t += candles[0].interval) {
      outputEntries.push({
        timestamp: t,
        open: '0',
        high: '0',
        low: '0',
        close: '0',
      });
    }

    let outputIdx = 0;
    let candlesIdx = 0;
    let lastClose = '0';
    let lastKnownPrice = '0';
    const candlesLength = candles.length;

    if (candlesLength === 0) {
      return {data: outputEntries, lastUpdateTimestamp: 0};
    }

    let nextCandleTimestamp = candles[candlesIdx].timestamp;

    while (outputIdx < outputEntries.length) {
      if (outputEntries[outputIdx].timestamp < nextCandleTimestamp) {
        // Fill with last known price if fillMissingCandles is true, otherwise keep zeros
        if (fillMissingCandles) {
          outputEntries[outputIdx].close = lastClose;
          outputEntries[outputIdx].high = lastClose;
          outputEntries[outputIdx].low = lastClose;
          outputEntries[outputIdx].open = lastClose;
        }

        outputIdx++;
        continue;
      }

      if (outputEntries[outputIdx].timestamp === nextCandleTimestamp) {
        // Use the actual candle data
        const candle = candles[candlesIdx];
        lastKnownPrice = isCumulative ? candle.sumUsed : candle.close;
        outputEntries[outputIdx] = {
          timestamp: candle.timestamp,
          open: isCumulative ? candle.sumUsed : candle.open,
          high: isCumulative ? candle.sumUsed : candle.high,
          low: isCumulative ? candle.sumUsed : candle.low,
          close: isCumulative ? candle.sumUsed : candle.close,
        };
        lastClose = isCumulative ? candle.sumUsed : candle.close;
        candlesIdx++;
        nextCandleTimestamp = candlesIdx < candlesLength 
          ? candles[candlesIdx].timestamp 
          : timeWindow.to + 1; // Set to future if no more candles

        outputIdx++;
        continue;
      }

      if (outputEntries[outputIdx].timestamp > nextCandleTimestamp) {
        // Move through candles until we find one that matches or is after the current output timestamp
        while (
          nextCandleTimestamp < outputEntries[outputIdx].timestamp &&
          candlesIdx < candlesLength
        ) {
          nextCandleTimestamp = candles[candlesIdx].timestamp;
          lastKnownPrice = isCumulative ? candles[candlesIdx].sumUsed : candles[candlesIdx].close;
          candlesIdx++;
        }

        if (nextCandleTimestamp === outputEntries[outputIdx].timestamp) {
          // Found a matching candle
          const candle = candles[candlesIdx - 1];
          outputEntries[outputIdx] = {
            timestamp: candle.timestamp,
            open: isCumulative ? candle.sumUsed : candle.open,
            high: isCumulative ? candle.sumUsed : candle.high,
            low: isCumulative ? candle.sumUsed : candle.low,
            close: isCumulative ? candle.sumUsed : candle.close,
          };
        } else if (fillMissingCandles) {
          // Fill with last known price if fillMissingCandles is true
          outputEntries[outputIdx].close = lastKnownPrice;
          outputEntries[outputIdx].high = lastKnownPrice;
          outputEntries[outputIdx].low = lastKnownPrice;
          outputEntries[outputIdx].open = lastKnownPrice;
        }
        outputIdx++;
      }
    }

    return {
      data: outputEntries,
      lastUpdateTimestamp: candles[candles.length - 1].lastUpdatedTimestamp
    };
  }

  private async getUpdatedMarketsAndMarketGroupsIfNeeded() {
    if (this.lastUpdateTimestamp > 0 && this.lastUpdateTimestamp > (Date.now() - 1000) * 300) {
      return;
    }
    // get all market groups
    const marketGroups = await getMarketGroups();
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }

}
