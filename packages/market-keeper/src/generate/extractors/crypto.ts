/// <reference types="node" />
import {
  MONTHS,
  endOfDayET,
  etOffset,
  inferYear,
  parseClock,
  toSec,
} from './shared';

/**
 * Crypto: price / intraday / by-date markets carry the resolution time in the
 * title. Handles intraday up/down windows, "above X on <date>, <time> ET",
 * "by <date>", and "in/before <year>". Year is inferred for bare month/day,
 * fixing the general extractor's wrong-year defaults.
 */
export function cryptoEndTime(question: string): number | null {
  const q = question ?? '';

  // intraday window "... - June 2, 3:45PM-4:00PM ET" -> window end (ET)
  let m = q.match(
    /-\s*([A-Za-z]+)\s+(\d{1,2}),\s*\d{1,2}(?::\d{2})?\s*[ap]m\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m)/i
  );
  // single-time intraday "... - June 3, 4PM ET"
  if (!m)
    m = q.match(
      /-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*et/i
    );
  // "above X on June 1, 5PM ET?"
  if (!m)
    m = q.match(
      /on\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*et/i
    );
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const clk = parseClock(m[3]);
    if (month != null && clk) {
      const day = parseInt(m[2], 10);
      const year = inferYear(month, day);
      return toSec(Date.UTC(year, month, day, clk.h + etOffset(month), clk.m));
    }
  }

  // "by December 14, 2026" / "by December 14"
  m = q.match(/by\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
  if (m && MONTHS[m[1].toLowerCase()] != null) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    const year = m[3] ? parseInt(m[3], 10) : inferYear(month, day);
    return toSec(endOfDayET(year, month, day));
  }

  // "before 2027" -> end of 2026 ; "in 2026" -> end of 2026
  m = q.match(/\bbefore\s+(20\d{2})/i);
  if (m) return toSec(endOfDayET(parseInt(m[1], 10) - 1, 11, 31));
  m = q.match(/\bin\s+(20\d{2})\b/i);
  if (m) return toSec(endOfDayET(parseInt(m[1], 10), 11, 31));

  return null;
}
