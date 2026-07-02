import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  bucketStatsByDay,
  filterDataByPeriod,
  formatLargeNumber,
  formatNumber,
} from './analyticsFormat';

const DAY = 86400;

// Locale-proof expectation helper — formatNumber delegates to
// toLocaleString(undefined, ...), so the tests must too.
function locale(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

describe('formatLargeNumber', () => {
  it('formats millions with an M suffix', () => {
    expect(formatLargeNumber(2_500_000, 2, true)).toBe('2.50M');
    expect(formatLargeNumber(1_000_000, 2, true)).toBe('1.00M');
  });

  it('formats thousands with a K suffix', () => {
    expect(formatLargeNumber(1_500, 2, true)).toBe('1.50K');
    expect(formatLargeNumber(999_999, 2, true)).toBe('1000.00K');
  });

  it('falls back to one decimal for M/K when useDecimals is false', () => {
    expect(formatLargeNumber(2_500_000, 3, false)).toBe('2.5M');
    expect(formatLargeNumber(1_500, 3, false)).toBe('1.5K');
  });

  it('renders sub-thousand values with decimals only when requested', () => {
    expect(formatLargeNumber(999.4, 2, true)).toBe('999.40');
    expect(formatLargeNumber(999.4, 2, false)).toBe('999');
    expect(formatLargeNumber(0, 2, false)).toBe('0');
  });
});

describe('formatNumber', () => {
  it('converts a wei string to a locale string in whole tokens', () => {
    expect(formatNumber('1500000000000000000000')).toBe(locale(1500));
    expect(formatNumber('1000000000000000000')).toBe(locale(1));
  });

  it('accepts numbers and a custom decimal count', () => {
    expect(formatNumber(2e18)).toBe(locale(2));
    expect(formatNumber('1234500000000000000', 4)).toBe(locale(1.2345, 4));
  });

  it("returns '0' for NaN input", () => {
    expect(formatNumber('not-a-number')).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });
});

describe('filterDataByPeriod', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes everything through (same reference) for ALL', () => {
    const data = [{ timestamp: 0 }, { timestamp: 1 }];
    expect(filterDataByPeriod(data, 'ALL')).toBe(data);
  });

  it('keeps points at or after the period cutoff (>= boundary)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 7 * DAY;

    const data = [
      { timestamp: cutoff - 1 }, // just outside the window → dropped
      { timestamp: cutoff }, // exactly on the boundary → kept
      { timestamp: now }, // now → kept
    ];

    expect(filterDataByPeriod(data, '1W')).toEqual([
      { timestamp: cutoff },
      { timestamp: now },
    ]);
  });

  it('applies the 30- and 90-day windows for 1M and 3M', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const now = Math.floor(Date.now() / 1000);

    const data = [
      { timestamp: now - 91 * DAY },
      { timestamp: now - 31 * DAY },
      { timestamp: now - 1 * DAY },
    ];

    expect(filterDataByPeriod(data, '1M')).toEqual([
      { timestamp: now - 1 * DAY },
    ]);
    expect(filterDataByPeriod(data, '3M')).toEqual([
      { timestamp: now - 31 * DAY },
      { timestamp: now - 1 * DAY },
    ]);
  });
});

describe('bucketStatsByDay', () => {
  it('keeps the last observation per UTC day and snaps timestamps to day start', () => {
    const day0 = 1_750_000_000 - (1_750_000_000 % DAY);
    const data = [
      { timestamp: day0 + 100, value: 1 },
      { timestamp: day0 + 5_000, value: 2 },
      { timestamp: day0 + 80_000, value: 3 }, // last snapshot of day0 wins
    ];

    expect(bucketStatsByDay(data)).toEqual([{ timestamp: day0, value: 3 }]);
  });

  it('produces one point per day, sorted ascending', () => {
    const day0 = 1_750_000_000 - (1_750_000_000 % DAY);
    const day1 = day0 + DAY;
    const day2 = day0 + 2 * DAY;

    // Chronological input whose later days interleave sub-daily snapshots.
    const data = [
      { timestamp: day0 + 10, value: 'a1' },
      { timestamp: day1 + 10, value: 'b1' },
      { timestamp: day1 + 20, value: 'b2' },
      { timestamp: day2 + 10, value: 'c1' },
    ];

    expect(bucketStatsByDay(data)).toEqual([
      { timestamp: day0, value: 'a1' },
      { timestamp: day1, value: 'b2' },
      { timestamp: day2, value: 'c1' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(bucketStatsByDay([])).toEqual([]);
  });
});
