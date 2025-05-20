import { TIME_INTERVALS } from 'src/fixtures';

export const CANDLE_CACHE_CONFIG = {
  logPrefix: '[CANDLE_CACHE]',
  batchSize: 500_000,
  intervals: [
    TIME_INTERVALS.intervals.INTERVAL_1_MINUTE,
    TIME_INTERVALS.intervals.INTERVAL_5_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_15_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_30_MINUTES,
    TIME_INTERVALS.intervals.INTERVAL_4_HOURS,
    TIME_INTERVALS.intervals.INTERVAL_1_DAY,
    TIME_INTERVALS.intervals.INTERVAL_7_DAYS,
    TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
  ],
  trailingAvgTime: [
    TIME_INTERVALS.intervals.INTERVAL_7_DAYS,
    TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
  ],
  preTrailingAvgTime: TIME_INTERVALS.intervals.INTERVAL_28_DAYS,
  lastProcessedResourcePrice: 'lastProcessedResourcePrice',
  lastProcessedMarketPrice: 'lastProcessedMarketPrice',
  hardRefresh: 'hardRefresh',
};

export const CANDLE_TYPES = {
  RESOURCE: 'resource',
  MARKET: 'market',
  TRAILING_AVG: 'trailingAvg',
  INDEX: 'index',
};
