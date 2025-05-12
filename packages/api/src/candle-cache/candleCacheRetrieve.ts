import { ResponseCandleData } from "./types";
import { CANDLE_CACHE_CONFIG, CANDLE_TYPES } from "./config";
import { getTimeWindow } from "./candleUtils";
import { getCandles } from "./dbUtils";
import { CacheCandle } from "src/models/CacheCandle";

export class CandleCacheRetrieve {
  private static instance: CandleCacheRetrieve;

  private constructor() {
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
    epoch: string
  ) {
    this.checkInterval(interval);
    // TODO: get the market id and check if it's cumulative
    let isCumulative = false;
    let marketIdx = 0;

    this.checkInterval(interval);
    const {from: allignedFrom, to: allignedTo} = getTimeWindow(from, to, interval);

    const candles = await getCandles({  
      marketIdx,
      interval,
      candleType: CANDLE_TYPES.INDEX,
      from: allignedFrom,
      to: allignedTo,
    }); 


    return this.getAndFillResponseCandles({
      candles,
      isCumulative,
      fillMissingCandles: false,
    });
  }

  async getTrailingAvgPrices(
    from: number,
    to: number,
    interval: number,
    trailingAvgTime: number
  ) {
    this.checkInterval(interval);
    // TODO: get the market id
    let marketIdx = 0;

    const candles = await getCandles({
      marketIdx,
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
    epoch: string
  ) {
    this.checkInterval(interval);
    // TODO: get the market id
    let marketIdx = 0;

    const candles = await getCandles({
      marketIdx,
      interval,
      candleType: CANDLE_TYPES.MARKET,
      from,
      to,
    }); 

    return this.getAndFillResponseCandles({
      candles,
      isCumulative: false,
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
        // Fill with last known price
        outputEntries[outputIdx].close = lastClose;
        outputEntries[outputIdx].high = lastClose;
        outputEntries[outputIdx].low = lastClose;
        outputEntries[outputIdx].open = lastClose;

        outputIdx++;
        continue;
      }

      if (outputEntries[outputIdx].timestamp === nextCandleTimestamp) {
        // Use the actual candle data
        lastKnownPrice = candles[candlesIdx].close;
        outputEntries[outputIdx] = {
          timestamp: candles[candlesIdx].timestamp,
          open: candles[candlesIdx].open,
          high: candles[candlesIdx].high,
          low: candles[candlesIdx].low,
          close: candles[candlesIdx].close,
        };
        lastClose = candles[candlesIdx].close;
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
          lastKnownPrice = candles[candlesIdx].close;
          candlesIdx++;
        }

        if (nextCandleTimestamp === outputEntries[outputIdx].timestamp) {
          // Found a matching candle
          outputEntries[outputIdx] = {
            timestamp: candles[candlesIdx - 1].timestamp,
            open: candles[candlesIdx - 1].open,
            high: candles[candlesIdx - 1].high,
            low: candles[candlesIdx - 1].low,
            close: candles[candlesIdx - 1].close,
          };
        } else {
          // Fill with last known price
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

}
