/// <reference types="node" />
/** Shared date helpers for the category-specific endTime extractors. */

export const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Rough US Eastern offset (hours to add to ET to reach UTC): EDT ~Mar–Oct else EST. */
export const etOffset = (month: number): number =>
  month >= 2 && month <= 10 ? 4 : 5;

export const toSec = (ms: number): number => Math.round(ms / 1000);

/** "23:59 ET on <date>" expressed in UTC ms. */
export const endOfDayET = (y: number, m: number, d: number): number =>
  Date.UTC(y, m, d, 23, 59) + etOffset(m) * 3_600_000;

/** Parse "5PM" / "4:15PM" into 24h. */
export function parseClock(s: string): { h: number; m: number } | null {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const pm = m[3].toLowerCase() === 'p';
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return { h, m: min };
}

/**
 * Year for a bare month/day with no year in the text: the calendar year
 * (previous / current / next) whose month-day lands nearest to *today*.
 * Anchored on the current date so it stays correct as time passes — month is
 * 0-indexed to match the MONTHS map above.
 */
export function inferYear(month: number, day: number): number {
  const now = Date.now();
  const curYear = new Date(now).getUTCFullYear();
  let best = curYear;
  let bestDist = Infinity;
  for (const y of [curYear - 1, curYear, curYear + 1]) {
    const dist = Math.abs(Date.UTC(y, month, day) - now);
    if (dist < bestDist) {
      bestDist = dist;
      best = y;
    }
  }
  return best;
}
