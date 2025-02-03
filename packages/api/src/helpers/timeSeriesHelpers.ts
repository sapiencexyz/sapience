/**
 * Takes a time series of data points and fills in any gaps with the last known value
 */
export function justifyTimeSeries<T extends { timestamp: number }>(
  data: T[],
  getValue: (item: T) => number
): (T & { timestamp: number })[] {
  const justifiedData: (T & { timestamp: number })[] = [];
  let lastTimestamp: number | null = null;
  let lastValue: number | undefined;
  let lastItem: T | undefined;

  data.forEach((item) => {
    const { timestamp } = item;
    const value = getValue(item);
    
    if (lastTimestamp !== null && lastItem) {
      // Fill in each missing second with the last known value
      for (let t = lastTimestamp + 1; t < timestamp; t++) {
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