import { type Period, PERIOD_DAYS } from '~/components/shared/PeriodFilter';

export function formatLargeNumber(
  value: number,
  decimals: number,
  useDecimals: boolean
): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(useDecimals ? decimals : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(useDecimals ? decimals : 1)}K`;
  }
  return value.toFixed(useDecimals ? decimals : 0);
}

export function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  const humanReadable = num / 1e18;
  return humanReadable.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function filterDataByPeriod<T extends { timestamp: number }>(
  data: T[],
  period: Period
): T[] {
  const days = PERIOD_DAYS[period];
  if (days === Infinity) return data;

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - days * 86400;
  return data.filter((item) => item.timestamp >= cutoff);
}

// Collapse sub-daily snapshots to one point per UTC day, keeping the last
// observation in the day. Used for stock-like metrics (OI, TVL) where summing
// would be wrong; the input is assumed to be in chronological order.
export function bucketStatsByDay<T extends { timestamp: number }>(
  data: T[]
): T[] {
  const byDay = new Map<number, T>();
  for (const point of data) {
    const dayStart = Math.floor(point.timestamp / 86400) * 86400;
    byDay.set(dayStart, { ...point, timestamp: dayStart });
  }
  return [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);
}
