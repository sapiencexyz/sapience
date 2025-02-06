import { ONE_DAY_MS, ONE_HOUR_MS, ONE_MINUTE_MS } from '../constants';

/**
 * Takes a time series of data points and fills in any gaps with the last known value based on the time window
 */
export function justifyTimeSeries<T extends { timestamp: number }>(
  data: T[],
  getValue: (item: T) => number,
  timeWindow: '1H' | '1D' | '1W' | '1M' | '1Y' = '1H'
): (T & { timestamp: number })[] {
  const justifiedData: (T & { timestamp: number })[] = [];
  let lastTimestamp: number | null = null;
  let lastValue: number | undefined;
  let lastItem: T | undefined;

  // Calculate interval in milliseconds based on time window to match getTimeParamsFromWindow
  const getIntervalInMs = (window: string) => {
    switch (window) {
      case '1Y':
        return ONE_DAY_MS * 7; // Weekly intervals for yearly view
      case '1M':
        return ONE_DAY_MS; // Daily intervals for monthly view
      case '1W':
        return 6 * ONE_HOUR_MS; // 6-hour intervals for weekly view
      case '1D':
        return ONE_HOUR_MS; // Hourly intervals for daily view
      case '1H':
        return 5 * ONE_MINUTE_MS; // 5-minute intervals for hourly view
      default:
        return 5 * ONE_MINUTE_MS; // default to 5-minute intervals
    }
  };

  const intervalMs = getIntervalInMs(timeWindow);
  const intervalSeconds = Math.floor(intervalMs / 1000);

  data.forEach((item) => {
    const { timestamp } = item;
    const value = getValue(item);

    if (lastTimestamp !== null && lastItem) {
      // Fill in each interval with the last known value
      for (
        let t = lastTimestamp + intervalSeconds;
        t < timestamp;
        t += intervalSeconds
      ) {
        if (lastValue !== undefined) {
          justifiedData.push({
            ...lastItem,
            timestamp: t,
          });
        }
      }
    }
    justifiedData.push(item);
    lastTimestamp = timestamp;
    lastValue = value;
    lastItem = item;
  });

  return justifiedData;
}
