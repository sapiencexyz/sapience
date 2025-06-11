import { ResponseCandleData } from './types';
import { CANDLE_CACHE_CONFIG, CANDLE_TYPES } from './config';
import { getTimeWindow } from './candleUtils';
import { getCandles, getMarketGroups } from './dbUtils';
import { CacheCandle } from 'src/models/CacheCandle';
import { MarketInfoStore } from './marketInfoStore';

export class CandleCacheRetriever {
  private static instance: CandleCacheRetriever;
  private marketInfoStore: MarketInfoStore;
  private lastUpdateTimestamp: number;

  private constructor() {
    this.marketInfoStore = MarketInfoStore.getInstance();
    this.lastUpdateTimestamp = 0;
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new CandleCacheRetriever();
    }
    return this.instance;
  }

  async getResourcePrices(
    resourceId: string,
    from: number,
    to: number,
    interval: number
  ): Promise<{ data: ResponseCandleData[]; lastUpdateTimestamp: number }> {
    this.checkInterval(interval);
    const { from: allignedFrom, to: allignedTo } = getTimeWindow(
      from,
      to,
      interval
    );

    const candles = await getCandles({
      resourceId,
      interval,
      candleType: CANDLE_TYPES.RESOURCE,
      from: allignedFrom,
      to: allignedTo,
    });

    return this.getAndFillResponseCandles({
      initialTimestamp: from,
      finalTimestamp: to,
      interval,
      candles,
      isCumulative: false,
      fillMissingCandles: true,
      fillInitialCandlesWithZeroes: true,
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
    const marketInfo = this.marketInfoStore.getMarketInfoByChainAndAddress(
      chainId,
      address,
      marketId
    );
    if (!marketInfo) {
      throw new Error(
        `Market not found for chainId: ${chainId}, address: ${address}, marketId: ${marketId}`
      );
    }

    const { from: allignedFrom, to: allignedTo } = getTimeWindow(
      from,
      to,
      interval
    );

    const candles = await getCandles({
      marketIdx: marketInfo.marketIdx,
      interval,
      candleType: CANDLE_TYPES.INDEX,
      from: allignedFrom,
      to: allignedTo,
    });

    return this.getAndFillResponseCandles({
      initialTimestamp: from,
      finalTimestamp: to,
      interval,
      candles,
      isCumulative: marketInfo.isCumulative,
      fillMissingCandles: false,
      fillInitialCandlesWithZeroes: false,
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
      initialTimestamp: from,
      finalTimestamp: to,
      interval,
      candles,
      isCumulative: false,
      fillMissingCandles: false,
      fillInitialCandlesWithZeroes: true,
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
    const marketInfo = this.marketInfoStore.getMarketInfoByChainAndAddress(
      chainId,
      address,
      marketId
    );
    if (!marketInfo) {
      throw new Error(
        `Market not found for chainId: ${chainId}, address: ${address}, marketId: ${marketId}`
      );
    }

    const candles = await getCandles({
      marketIdx: marketInfo.marketIdx,
      interval,
      candleType: CANDLE_TYPES.MARKET,
      from,
      to,
    });

    return this.getAndFillResponseCandles({
      initialTimestamp: from,
      finalTimestamp: to,
      interval,
      candles,
      isCumulative: false,
      fillMissingCandles: true,
      fillInitialCandlesWithZeroes: true,
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
    initialTimestamp,
    finalTimestamp,
    interval,
    candles,
    isCumulative,
    fillMissingCandles,
    fillInitialCandlesWithZeroes,
  }: {
    initialTimestamp: number;
    finalTimestamp: number;
    interval: number;
    candles: CacheCandle[];
    isCumulative: boolean;
    fillMissingCandles: boolean;
    fillInitialCandlesWithZeroes: boolean;
  }): Promise<{ data: ResponseCandleData[]; lastUpdateTimestamp: number }> {
    if ((!candles || candles.length === 0) && (!fillMissingCandles || !fillInitialCandlesWithZeroes)) {
      return { data: [], lastUpdateTimestamp: 0 };
    }

    const timeWindow = getTimeWindow(
      initialTimestamp,
      finalTimestamp,
      interval
    );

    // First, create entries only for the candles we have
    const outputEntries: ResponseCandleData[] = candles.map((candle) => ({
      timestamp: candle.timestamp,
      open: isCumulative ? candle.sumUsed : candle.open,
      high: isCumulative ? candle.sumUsed : candle.high,
      low: isCumulative ? candle.sumUsed : candle.low,
      close: isCumulative ? candle.sumUsed : candle.close,
    }));

    // If we need to fill missing candles or initial zeroes
    if (fillMissingCandles || fillInitialCandlesWithZeroes) {
      const filledEntries: ResponseCandleData[] = [];
      let lastKnownPrice = '0';
      let outputEntriesIdx = 0;

      // Add initial zero entries if needed
      if (fillInitialCandlesWithZeroes) {
        const firstCandleTimestamp = candles[0].timestamp;
        for (
          let t = timeWindow.from;
          t < firstCandleTimestamp;
          t += interval
        ) {
          filledEntries.push({
            timestamp: t,
            open: '0',
            high: '0',
            low: '0',
            close: '0',
          });
        }
      }

      // Process all timestamps in the window
      for (
        let t = fillInitialCandlesWithZeroes
          ? timeWindow.from
          : candles[0].timestamp;
        t < timeWindow.to;
        t += interval
      ) {
        // Move pointer forward until we find a matching or later timestamp
        while (
          outputEntriesIdx < outputEntries.length &&
          outputEntries[outputEntriesIdx].timestamp < t
        ) {
          outputEntriesIdx++;
        }

        if (
          outputEntriesIdx < outputEntries.length &&
          outputEntries[outputEntriesIdx].timestamp === t
        ) {
          // Use the actual candle data
          filledEntries.push(outputEntries[outputEntriesIdx]);
          lastKnownPrice = outputEntries[outputEntriesIdx].close;
        } else if (fillMissingCandles) {
          // Fill with last known price if fillMissingCandles is true
          filledEntries.push({
            timestamp: t,
            open: lastKnownPrice,
            high: lastKnownPrice,
            low: lastKnownPrice,
            close: lastKnownPrice,
          });
        }
      }

      return {
        data: filledEntries,
        lastUpdateTimestamp: candles[candles.length - 1].lastUpdatedTimestamp,
      };
    }

    return {
      data: outputEntries,
      lastUpdateTimestamp: candles[candles.length - 1].lastUpdatedTimestamp,
    };
  }

  private async getUpdatedMarketsAndMarketGroupsIfNeeded() {
    if (
      this.lastUpdateTimestamp > 0 &&
      this.lastUpdateTimestamp > (Date.now() - 1000) * 300
    ) {
      return;
    }
    // get all market groups
    const marketGroups = await getMarketGroups();
    await this.marketInfoStore.updateMarketInfo(marketGroups);
  }
}
