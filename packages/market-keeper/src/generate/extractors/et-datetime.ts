/// <reference types="node" />
import {
  getDstAwareOffsetHours,
  parseMonth,
  parseTimeStr,
  toTs,
} from '../endtime';

/**
 * "Month D, YYYY[,] h[:mm] AM/PM ET" — the exact-timestamp form Polymarket uses
 * in its templated resolution sentences (the comma after the year is optional;
 * different families punctuate it differently). The year is required, which is
 * always present on the resolution timestamp these extractors read.
 */
const ET_DATETIME =
  /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*ET/i;

/**
 * Parse the FIRST "Month D, YYYY[,] time ET" found in `text` to a unix
 * timestamp (seconds), DST-aware in US Eastern (EDT in summer, EST in winter)
 * via the shared America/New_York offset helper. Returns null when no such
 * timestamp is present or the month/time can't be parsed.
 *
 * Callers anchor on their family's resolution phrase first and pass only the
 * captured fragment, so this never has to disambiguate between multiple dates.
 */
export function parseEtDateTime(text: string): number | null {
  const m = ET_DATETIME.exec(text ?? '');
  if (!m) return null;
  const month = parseMonth(m[1]); // 1-12, or 0 if unrecognised
  if (month === 0) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const clock = parseTimeStr(m[4].trim());
  if (!clock) return null;
  const tzOff = getDstAwareOffsetHours(year, month, day, 'America/New_York');
  return toTs(year, month, day, clock.h, clock.m, tzOff);
}
