import { cache_candle } from '../../generated/prisma';

// Use Prisma's generated type for cache_candle
type CacheCandle = cache_candle;

export type CandleType = 'market' | 'resource' | 'index' | 'trailingAvg';

export class RuntimeCandleStore {
  private candles: Map<string, CacheCandle> = new Map();

  // Optimized key generation for known small number of intervals/times
  private static getKey(
    type: CandleType,
    id: number | string,
    interval: number,
    trailingAvgTime?: number
  ): string {
    if (type === 'trailingAvg' && trailingAvgTime !== undefined) {
      return `${type}:${id}:${interval}:${trailingAvgTime}`;
    }
    return `${type}:${id}:${interval}`;
  }

  // Get a market candle
  getMarketCandle(
    marketIdx: number,
    interval: number
  ): CacheCandle | undefined {
    return this.candles.get(
      RuntimeCandleStore.getKey('market', marketIdx, interval)
    );
  }

  // Get a resource candle
  getResourceCandle(
    resourceSlug: string,
    interval: number
  ): CacheCandle | undefined {
    return this.candles.get(
      RuntimeCandleStore.getKey('resource', resourceSlug, interval)
    );
  }

  // Get an index candle
  getIndexCandle(marketIdx: number, interval: number): CacheCandle | undefined {
    return this.candles.get(
      RuntimeCandleStore.getKey('index', marketIdx, interval)
    );
  }

  // Get a trailing average candle
  getTrailingAvgCandle(
    resourceSlug: string,
    interval: number,
    trailingAvgTime: number
  ): CacheCandle | undefined {
    return this.candles.get(
      RuntimeCandleStore.getKey(
        'trailingAvg',
        resourceSlug,
        interval,
        trailingAvgTime
      )
    );
  }

  // Set a market candle
  setMarketCandle(
    marketIdx: number,
    interval: number,
    candle: CacheCandle
  ): void {
    this.candles.set(
      RuntimeCandleStore.getKey('market', marketIdx, interval),
      candle
    );
  }

  // Set a resource candle
  setResourceCandle(
    resourceSlug: string,
    interval: number,
    candle: CacheCandle
  ): void {
    this.candles.set(
      RuntimeCandleStore.getKey('resource', resourceSlug, interval),
      candle
    );
  }

  // Set an index candle
  setIndexCandle(
    marketIdx: number,
    interval: number,
    candle: CacheCandle
  ): void {
    this.candles.set(
      RuntimeCandleStore.getKey('index', marketIdx, interval),
      candle
    );
  }

  // Set a trailing average candle
  setTrailingAvgCandle(
    resourceSlug: string,
    interval: number,
    trailingAvgTime: number,
    candle: CacheCandle
  ): void {
    this.candles.set(
      RuntimeCandleStore.getKey(
        'trailingAvg',
        resourceSlug,
        interval,
        trailingAvgTime
      ),
      candle
    );
  }

  // Get all market candles for a specific market
  getAllMarketCandles(marketIdx: number): Map<number, CacheCandle> {
    const result = new Map<number, CacheCandle>();
    const prefix = `market:${marketIdx}:`;
    for (const [key, candle] of this.candles.entries()) {
      if (key.startsWith(prefix)) {
        const interval = Number(key.split(':')[2]);
        result.set(interval, candle);
      }
    }
    return result;
  }

  // Get all resource candles for a specific resource
  getAllResourceCandles(resourceSlug: string): Map<number, CacheCandle> {
    const result = new Map<number, CacheCandle>();
    const prefix = `resource:${resourceSlug}:`;
    for (const [key, candle] of this.candles.entries()) {
      if (key.startsWith(prefix)) {
        const interval = Number(key.split(':')[2]);
        result.set(interval, candle);
      }
    }
    return result;
  }

  // Get all index candles for a specific market
  getAllIndexCandles(marketIdx: number): Map<number, CacheCandle> {
    const result = new Map<number, CacheCandle>();
    const prefix = `index:${marketIdx}:`;
    for (const [key, candle] of this.candles.entries()) {
      if (key.startsWith(prefix)) {
        const interval = Number(key.split(':')[2]);
        result.set(interval, candle);
      }
    }
    return result;
  }

  // Get all trailing average candles for a specific resource and trailing average time
  getAllTrailingAvgCandles(
    resourceSlug: string,
    trailingAvgTime: number
  ): Map<number, CacheCandle> {
    const result = new Map<number, CacheCandle>();
    const prefix = `trailingAvg:${resourceSlug}:`;
    for (const [key, candle] of this.candles.entries()) {
      if (key.startsWith(prefix)) {
        const [, , interval, keyTrailingAvgTime] = key.split(':');
        if (Number(keyTrailingAvgTime) === trailingAvgTime) {
          result.set(Number(interval), candle);
        }
      }
    }
    return result;
  }

  // Check if a market has candles
  hasMarketCandles(marketIdx: number): boolean {
    const prefix = `market:${marketIdx}:`;
    for (const key of this.candles.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  // Check if a resource has candles
  hasResourceCandles(resourceSlug: string): boolean {
    const prefix = `resource:${resourceSlug}:`;
    for (const key of this.candles.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  // Check if a market has index candles
  hasIndexCandles(marketIdx: number): boolean {
    const prefix = `index:${marketIdx}:`;
    for (const key of this.candles.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  // Check if a resource has trailing average candles
  hasTrailingAvgCandles(resourceSlug: string): boolean {
    const prefix = `trailingAvg:${resourceSlug}:`;
    for (const key of this.candles.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  // Get all market indices that have candles
  getAllMarketIndices(): number[] {
    const indices = new Set<number>();
    for (const key of this.candles.keys()) {
      if (key.startsWith('market:')) {
        const marketIdx = Number(key.split(':')[1]);
        indices.add(marketIdx);
      }
    }
    return Array.from(indices);
  }

  // Get all resource slugs that have candles
  getAllResourceSlugs(): string[] {
    const slugs = new Set<string>();
    for (const key of this.candles.keys()) {
      if (key.startsWith('resource:') || key.startsWith('trailingAvg:')) {
        const resourceSlug = key.split(':')[1];
        slugs.add(resourceSlug);
      }
    }
    return Array.from(slugs);
  }
}
