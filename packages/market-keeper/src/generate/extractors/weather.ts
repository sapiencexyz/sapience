/// <reference types="node" />
import { MONTHS, inferYear, toSec } from './shared';
import { cityOffsetForDate } from './weather-tz';

/**
 * Weather: "...temperature in <City> be ... on <Month Day>?" — the resolution
 * date is in the title and the year in the description ("5 Jun '26"). It resolves
 * once that day's high/low is final (Wunderground), i.e. the end of the day in
 * the CITY's local time. So we parse the city, map it to its timezone, and return
 * the local end-of-day. Year and offset fall back when either is unknown.
 */
const DEFAULT_OFFSET = 2; // ≈ Europe (empirical median) for unmapped cities

export function weatherEndTime(
  question: string,
  description: string
): number | null {
  if (!/temperature in /i.test(question)) return null;
  const md = question.match(/\bon\s+([A-Za-z]+)\s+(\d{1,2})\b/i);
  if (!md) return null;
  const month = MONTHS[md[1].toLowerCase()];
  if (month == null) return null;
  const day = parseInt(md[2], 10);

  const y4 = description.match(/\b(20\d{2})\b/);
  const y2 = description.match(/'(\d{2})\b/);
  const year = y4
    ? parseInt(y4[1], 10)
    : y2
      ? 2000 + parseInt(y2[1], 10)
      : inferYear(month, day);

  // city -> timezone -> end of the local day (23:59 local), expressed in UTC
  const cm = question.match(/temperature in (.+?)\s+(?:be|on)\b/i);
  const offset =
    (cm ? cityOffsetForDate(cm[1], year, month + 1, day) : null) ??
    DEFAULT_OFFSET;
  return toSec(Date.UTC(year, month, day, 23, 59) - offset * 3_600_000);
}
