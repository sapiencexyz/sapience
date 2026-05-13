/**
 * Shared time-window model used by the analytics charts, the Top Accounts
 * leaderboard, and the vault PnL chart. Kept free of React so pure data
 * helpers (filtering, query keys) can be imported by utils and tests
 * without pulling in the picker component.
 *
 * See {@link ./TimeRangeFilter} for the UI control.
 */

export type RangePreset = '1W' | '1M' | '3M' | 'ALL' | 'CUSTOM';
export type FixedPreset = Exclude<RangePreset, 'CUSTOM'>;

/**
 * A selected time window. For the fixed presets the bounds are derived on
 * demand ({@link rangeToDates}); for `CUSTOM` the bounds are carried
 * explicitly. An undefined bound means "unbounded on that side" (e.g. `ALL`
 * ⇒ both undefined; a "from a date until now" custom range ⇒ `to` undefined).
 */
export interface TimeRange {
  preset: RangePreset;
  from?: Date;
  to?: Date;
}

const PRESET_DAYS: Record<Exclude<FixedPreset, 'ALL'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const ALL_RANGE: TimeRange = { preset: 'ALL' };

export function presetRange(preset: FixedPreset): TimeRange {
  return { preset };
}

/**
 * Concrete `Date` bounds; an undefined side means unbounded there.
 * `now` is injectable so callers that already have a reference time (e.g. a
 * chart's snapshot clock) get deterministic results.
 */
export function rangeToDates(
  range: TimeRange,
  now: Date = new Date()
): { from?: Date; to?: Date } {
  if (range.preset === 'ALL') return {};
  if (range.preset === 'CUSTOM') return { from: range.from, to: range.to };
  return { from: new Date(now.getTime() - PRESET_DAYS[range.preset] * DAY_MS) };
}

/** Epoch-second bounds (floored); an undefined side means unbounded there. */
export function rangeToEpochs(
  range: TimeRange,
  now?: Date
): {
  fromSec?: number;
  toSec?: number;
} {
  const { from, to } = rangeToDates(range, now);
  return {
    fromSec: from ? Math.floor(from.getTime() / 1000) : undefined,
    toSec: to ? Math.floor(to.getTime() / 1000) : undefined,
  };
}

/** Filter rows keyed by an epoch-second `timestamp` field down to the range. */
export function filterByRange<T extends { timestamp: number }>(
  data: T[],
  range: TimeRange
): T[] {
  const { fromSec, toSec } = rangeToEpochs(range);
  if (fromSec == null && toSec == null) return data;
  return data.filter(
    (d) =>
      (fromSec == null || d.timestamp >= fromSec) &&
      (toSec == null || d.timestamp <= toSec)
  );
}

/** Stable key fragment for react-query etc. */
export function rangeKey(range: TimeRange): string {
  const { from, to } = rangeToDates(range);
  return `${range.preset}:${from?.toISOString() ?? ''}:${to?.toISOString() ?? ''}`;
}
