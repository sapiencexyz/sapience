/**
 * Pure matcher for the "today" tag.
 *
 * Returns true if `question` mentions today's or tomorrow's UTC date in
 * one of the supported forms:
 *   - literal words: "today" / "tomorrow"
 *   - month name + day: "May 18", "18 May", "May 18, 2026", "May 18 2026"
 *   - ISO: "2026-05-18"
 *
 * Slash and dash numeric forms ("5/18", "5-18") are intentionally NOT
 * matched — they produce too many false positives on score-like text.
 *
 * All matching is case-insensitive and word-bounded so substrings inside
 * other words don't trigger (e.g. "May 1800s" doesn't match "May 18").
 */

// The tag is stored Title-Cased to match how the API normalizes tags on
// write (PUT /admin/conditions/batch-metadata). Comparing with 'today'
// (lowercase) would fail to strip stored 'Today' values.
export const TODAY_TAG = 'Today';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function utcDayStart(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0)
  );
}

interface DayRegexes {
  isoRegex: RegExp;
  monthDayRegex: RegExp;
  dayMonthRegex: RegExp;
}

function buildRegexesForDay(d: Date): DayRegexes {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1-12
  const day = d.getUTCDate();

  // ISO "YYYY-MM-DD" — word-bounded.
  const isoRegex = new RegExp(`\\b${year}-${pad2(month)}-${pad2(day)}\\b`);

  // The day number with year-suffix optional. Negative lookahead `(?!\d)`
  // protects against "1800s" being read as 18.
  const dayPattern = `${day}(?:st|nd|rd|th)?(?!\\d)`;

  const monthAlternation = `(?:${MONTH_NAMES[month - 1]}|${MONTH_SHORT[month - 1]}\\.?)`;

  // "May 18", "May 18, 2026", "May 18 2026" — word-bounded month, day
  // not followed by another digit. The (?:,?\s*\d{4})? makes the year
  // optional and tolerant of a comma.
  const monthDayRegex = new RegExp(
    `\\b${monthAlternation}\\s+${dayPattern}(?:,?\\s*\\d{4})?\\b`,
    'i'
  );

  // "18 May", "18 May 2026"
  const dayMonthRegex = new RegExp(
    `\\b${day}(?:st|nd|rd|th)?(?!\\d)\\s+${monthAlternation}(?:\\s+\\d{4})?\\b`,
    'i'
  );

  return { isoRegex, monthDayRegex, dayMonthRegex };
}

export function questionMentionsImminentDate(
  question: string,
  now: Date
): boolean {
  if (!question) return false;

  // Literal "today" / "tomorrow" — word-bounded, case-insensitive
  if (/\btoday\b/i.test(question)) return true;
  if (/\btomorrow\b/i.test(question)) return true;

  const today = utcDayStart(now);
  const tomorrow = new Date(today.getTime() + 86400 * 1000);

  for (const target of [today, tomorrow]) {
    const { isoRegex, monthDayRegex, dayMonthRegex } =
      buildRegexesForDay(target);
    if (isoRegex.test(question)) return true;
    if (monthDayRegex.test(question)) return true;
    if (dayMonthRegex.test(question)) return true;
  }

  return false;
}

/**
 * Compute the desired tag set for a condition given its current tags and
 * whether the question matched. Always strip-then-re-add so yesterday's
 * tag gets cleaned up on markets that no longer match.
 */
export function computeDesiredTags(
  currentTags: string[],
  shouldBeImminent: boolean
): string[] {
  const without = currentTags.filter((t) => t !== TODAY_TAG);
  return shouldBeImminent ? [...without, TODAY_TAG] : without;
}
