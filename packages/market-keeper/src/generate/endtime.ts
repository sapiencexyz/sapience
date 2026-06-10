/**
 * Regex-based endTime extraction from market question + description.
 * Ported from scripts/endtime-compare-gamma.py.
 *
 * Returns a unix timestamp (seconds) for the predicted resolution time,
 * or null if no date can be extracted (tier 6 — caller sends to Sonar).
 */

const MONTHS =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const SPORT_DURATIONS: Record<string, number> = {
  tennis: 4,
  soccer: 2.5,
  football: 3.5,
  nfl: 3.5,
  nba: 3,
  basketball: 3,
  hockey: 3,
  nhl: 3,
  baseball: 4,
  mlb: 4,
  esports: 4,
  cs2: 4,
  valorant: 4,
  lol: 4,
  dota: 4,
  mma: 5,
  ufc: 5,
  boxing: 5,
  combat: 5,
  cricket: 8,
  golf: 6,
};

const CITY_TZ_OFFSET: Record<string, number> = {
  'new york': -4,
  'new york city': -4,
  nyc: -4,
  boston: -4,
  miami: -4,
  atlanta: -4,
  detroit: -4,
  philadelphia: -4,
  washington: -4,
  chicago: -5,
  dallas: -5,
  houston: -5,
  denver: -6,
  phoenix: -7,
  'los angeles': -7,
  la: -7,
  seattle: -7,
  'san francisco': -7,
  'las vegas': -7,
  london: 0,
  paris: 2,
  berlin: 2,
  amsterdam: 2,
  madrid: 2,
  rome: 2,
  moscow: 3,
  dubai: 4,
  mumbai: 5,
  delhi: 5,
  bangalore: 5,
  shanghai: 8,
  beijing: 8,
  'hong kong': 8,
  singapore: 8,
  tokyo: 9,
  seoul: 9,
  sydney: 10,
  melbourne: 10,
  johannesburg: 2,
  cairo: 2,
  nairobi: 3,
};

// Map timezone abbreviations to IANA zone names. Intl.DateTimeFormat picks
// the right DST variant (EST vs EDT, CST vs CDT, GMT vs BST) automatically
// from any given calendar date in that zone — so we never hard-code the
// summer/winter offset and stop being wrong half the year.
const TZ_ABBR_TO_IANA: Record<string, string> = {
  ET: 'America/New_York',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CT: 'America/Chicago',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MT: 'America/Denver',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  UTC: 'UTC',
  GMT: 'Europe/London',
  CET: 'Europe/Berlin',
  CEST: 'Europe/Berlin',
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',
};

export function parseMonth(s: string): number {
  return MONTH_MAP[s.toLowerCase().replace(/\.$/, '')] ?? 0;
}

/**
 * Compute the UTC offset (in hours) of `ianaZone` on the given calendar date.
 * DST-aware: returns -5 for America/New_York on 2028-11-07 (EST), -4 on
 * 2028-07-04 (EDT). Backed by Intl.DateTimeFormat which carries the IANA
 * tzdata, so DST transition rules stay correct without us hand-coding them.
 *
 * Samples at noon UTC to avoid edge cases near midnight on DST transition
 * days (when 02:00 local time either repeats or skips).
 */
export function getDstAwareOffsetHours(
  year: number,
  month: number,
  day: number,
  ianaZone: string
): number {
  const testUtcMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(testUtcMs));
  const part = (t: string): number => {
    const p = parts.find((x) => x.type === t);
    return p ? parseInt(p.value, 10) : 0;
  };
  let ph = part('hour');
  if (ph === 24) ph = 0; // some zones format midnight as "24" in en-US
  const localAsUtcMs = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    ph,
    part('minute'),
    0
  );
  return Math.round((localAsUtcMs - testUtcMs) / 3600000);
}

/**
 * Detect an IANA timezone from an explicit abbreviation in `text` (e.g. "ET",
 * "PST", "GMT"). Case-sensitive on the abbrev to avoid matching substrings
 * inside other uppercase words. Returns null if no abbreviation is present.
 */
export function detectTzIana(text: string): string | null {
  // Longer first so "EDT"/"EST" win over "ET" when both are present.
  const ordered = Object.keys(TZ_ABBR_TO_IANA).sort(
    (a, b) => b.length - a.length
  );
  for (const abbr of ordered) {
    if (new RegExp(`\\b${abbr}\\b`).test(text)) return TZ_ABBR_TO_IANA[abbr];
  }
  return null;
}

/**
 * DST-aware replacement for the old `detectTzOffset` callsite pattern.
 * Detects an IANA zone from the text and returns the actual offset hours
 * for `year-month-day` (so EST in winter, EDT in summer, GMT vs BST, etc.).
 * Returns null when no recognised timezone abbreviation is in the text;
 * callers chain it with `??` for their tier-specific fallback.
 */
export function tzOffsetForDate(
  text: string,
  year: number,
  month: number,
  day: number
): number | null {
  const iana = detectTzIana(text);
  if (!iana) return null;
  return getDstAwareOffsetHours(year, month, day, iana);
}

/**
 * Infer a sensible IANA timezone from the *subject* of a market when no
 * explicit timezone is named. US political/sports/legal markets get
 * America/New_York; UK political markets get Europe/London. The intent is
 * narrow — only for the "scheduled event with no time given" fallback in
 * tier 2b. Adding zones here is fine; just keep the keywords specific enough
 * that a passing mention ("London startup raises round") won't override the
 * actual market subject.
 */
export function inferContextZone(text: string): string | null {
  const t = text.toLowerCase();
  // UK first — its keywords are more specific so unlikely to collide with US.
  if (
    /\b(uk|u\.k\.|united kingdom|british|britain|parliament|house of commons|downing street|whitehall|westminster|prime minister)\b/.test(
      t
    )
  ) {
    return 'Europe/London';
  }
  if (
    /\b(u\.s\.|usa|u\.s\.a|united states|american|president|presidential|senate|senator|congress|congressional|house of representatives|supreme court|federal reserve|white house|electoral|inauguration|governor|nfl|nba|mlb|nhl|ncaa|wnba)\b/.test(
      t
    ) ||
    // Bare "US" as the country abbreviation — matched case-sensitively against
    // the ORIGINAL text so the lowercase pronoun "us" ("join us", "tell us")
    // doesn't get mistaken for a United-States context.
    /\bUS\b/.test(text)
  ) {
    return 'America/New_York';
  }
  return null;
}

/**
 * Convert local date/time to a UTC unix timestamp.
 * tzOffsetHours is the UTC offset of the local timezone (e.g. -4 for ET).
 * Formula: utc_ts = local_time_treated_as_utc - tzOffset * 3600
 * Example: 2 PM ET (UTC-4) → Date.UTC(...14:00...) - (-4*3600) = 18:00 UTC ✓
 */
export function toTs(
  year: number,
  month: number,
  day: number,
  hour = 23,
  minute = 59,
  tzOffsetHours = 0
): number {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  return Math.floor(utcMs / 1000 - tzOffsetHours * 3600);
}

/**
 * Parse time string like "1:10PM", "14:30", "9 PM" → {h, m} in 24h, or null.
 */
export function parseTimeStr(s: string): { h: number; m: number } | null {
  const str = s.trim().toUpperCase();

  let m = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (m) {
    let h = parseInt(m[1]);
    const mn = parseInt(m[2]);
    const ampm = m[3];
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { h, m: mn };
  }

  m = str.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (m) {
    let h = parseInt(m[1]);
    const ampm = m[2];
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { h, m: 0 };
  }

  return null;
}

/**
 * Detect UTC offset from timezone abbreviation (e.g. "ET" → -4, "UTC" → 0).
 * Returns null if unrecognised.
 */
export function detectTzOffset(text: string): number | null {
  const t = text.toUpperCase();
  if (/\bE[DS]T\b|\bET\b/.test(t)) return -4;
  if (/\bC[DS]T\b|\bCT\b/.test(t)) return -5;
  if (/\bM[DS]T\b|\bMT\b/.test(t)) return -6;
  if (/\bP[DS]T\b|\bPT\b/.test(t)) return -7;
  if (/\bGMT\b|\bUTC\b/.test(t)) return 0;
  if (/\bCE[ST]T?\b/.test(t)) return 2;
  if (/\bJST\b/.test(t)) return 9;
  if (/\bKST\b/.test(t)) return 9;
  if (/\bIST\b/.test(t)) return 5;
  return null;
}

/**
 * Detect typical event duration in hours based on sport keywords.
 * Returns null if no sport keyword found.
 */
export function detectSportDuration(text: string): number | null {
  const t = text.toLowerCase();
  for (const [sport, dur] of Object.entries(SPORT_DURATIONS)) {
    if (t.includes(sport)) return dur;
  }
  return null;
}

/**
 * Pick the most sensible year for a bare month+day reference:
 * uses the current year unless that date is already > 1 day in the past,
 * in which case it returns current year + 1.
 */
export function extractYear(month: number, day: number): number {
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(curYear, month - 1, day));
  const oneDayAgo = new Date(now.getTime() - 86400 * 1000);
  return candidate < oneDayAgo ? curYear + 1 : curYear;
}

/**
 * Detect whether a description contains an explicit time marker the
 * date-only regex tiers cannot extract (clock time, AM/PM, named timezone,
 * "noon"/"midnight"). When this returns true, date-only tiers should
 * decline rather than stamp end-of-day — the description has time-of-day
 * precision that we'd be silently dropping. Caller then falls through to
 * the LLM or Polymarket's endDate, which can preserve the time.
 *
 * Scoped narrowly: timezone abbreviations must be word-bounded so "EAST"
 * (no zone) or "stuck in CST" (the abbrev as substring of a non-timezone
 * word) don't trip the guard.
 */
export function descHasTimingMarker(desc: string): boolean {
  if (!desc) return false;
  if (/\b(?:noon|midnight)\b/i.test(desc)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(desc)) return true;
  if (/\b\d{1,2}\s*(?:AM|PM|am|pm)\b/.test(desc)) return true;
  if (
    /\b(?:ET|EST|EDT|UTC|GMT|PT|PST|PDT|CT|CST|CDT|MT|MST|MDT|JST|KST|IST|CET|CEST|Eastern|Pacific|Central|Mountain)\b/.test(
      desc
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Extract a resolution end-time from market question + description.
 * Tries tiers 0–4f in order; returns null (tier 6) if none match.
 */
export function extractEndTime(
  question: string,
  description: string,
  out?: { tier: string }
): number | null {
  const desc = description ?? '';
  // Strip "initially scheduled for ..." clauses — these carry stale dates superseded
  // by a reschedule. Removing them lets later clauses (or Sonar) find the real date.
  const cleanDesc = desc.replace(
    /\binitially\s+scheduled\s+for\b[^.]*\.?/gi,
    ''
  );
  const combined = (question + ' ' + cleanDesc).trim();

  // Date-only tiers (3a, 3b, 4a, 4b, 4d, 4e, 4f, 4month, 4month2, 4week) stamp
  // end-of-day because the question text gives no clock time. When the
  // description does name a time (e.g. "noon ET", "12:00 PM", "2:00 PM EST"),
  // declining the date-only tier lets the caller fall back to the LLM or
  // Polymarket endDate, both of which preserve the actual time. See the
  // ETH/USDT $1,800 prod bug: title "on May 16?" + desc "noon ET" → without
  // this guard, Tier 4e returned end-of-day instead of letting noon ET stand.
  const hasTimingMarker = descHasTimingMarker(cleanDesc);

  let m: RegExpExecArray | null;

  // ── Tier 0p: Pyth Lazer endTime embedded in description ────────────────────
  // Format: "PYTH_LAZER|...|endTime=1773870300|..."
  const pythMatch = /\bendTime=(\d{9,11})\b/.exec(desc);
  if (pythMatch) {
    const ts = parseInt(pythMatch[1]);
    if (ts > 1_000_000_000 && ts < 3_000_000_000) {
      if (out) out.tier = '0p';
      return ts;
    }
  }

  // ── Tier 0: Crypto "Up or Down – Month Day, Time TZ" ──────────────────────
  m = new RegExp(
    `Up or Down\\s*[-–]\\s*(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?,\\s*(\\d{1,2}(?::\\d{2})?)(?:\\s*-\\s*\\d{1,2}(?::\\d{2})?)?\\s*(?:([AP]M)\\s*)?([A-Z]{2,4})?`,
    'i'
  ).exec(question);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const timePart = m[4] + (m[5] ? ' ' + m[5] : '');
    const tzStr = m[6] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff =
      (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ??
      tzOffsetForDate(question, yr, mon, day) ??
      -4;
    if (parsed) {
      if (out) out.tier = '0';
      return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
    }
  }

  // ── Tier 1a: Pyth price at specific datetime ──────────────────────────────
  m = new RegExp(
    `price of \\w+\\s+(?:be\\s+(?:above|below|at)\\s+\\S+\\s+)?(?:at|on)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\s*(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm)?)\\s*([A-Z]{2,4})?`,
    'i'
  ).exec(combined);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const timePart = m[4];
    const tzStr = m[5] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? -5;
    if (parsed) {
      if (out) out.tier = '1a';
      return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
    }
  }

  // ── Tier 1c: "resolves by" with datetime (description only) ──────────────
  m = new RegExp(
    `resolv\\w*\\s+(?:by|before|at|on)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\s*(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?)\\s*([A-Z]{2,4})?`,
    'i'
  ).exec(cleanDesc);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const timePart = m[4];
    const tzStr = m[5] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? 0;
    if (parsed) {
      if (out) out.tier = '1c';
      return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
    }
  }

  // ── Tier 1d: "on [Month Day] at [Time]" ───────────────────────────────────
  m = new RegExp(
    `\\bon\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?)\\s*([A-Z]{2,4})?`,
    'i'
  ).exec(combined);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const timePart = m[4];
    const tzStr = m[5] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? 0;
    if (parsed) {
      if (out) out.tier = '1d';
      return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
    }
  }

  // ── Tier 1e: "by [Month Day][, Year][,] [HH:MM] AM/PM [TZ]" ───────────────
  // Free-form deadline phrases in the description that don't say "resolves"
  // but do specify a Month Day + AM/PM time. Example (Ryanair):
  //   "...enters into an agreement to buy Ryanair by June 30, 2026, 11:59 PM ET"
  // The AM/PM requirement is the safety net — without it, "by 5" or "by 30"
  // would false-match. The trailing comma after year is tolerated because
  // descriptions commonly use "by Month Day, Year, HH:MM PM TZ" with the
  // double-comma punctuation.
  //
  // Guard against the Class-C cancellation-fallback pattern: descriptions
  // like "If the World Cup is canceled or has not been completed by Oct 13,
  // 2026, 11:59 PM this market will resolve to 'Other'" name a date that
  // ISN'T the resolution deadline — it's the fallback. We skip any "by
  // [date]" whose resolution outcome (within ~200 chars after) is "Other".
  // Iterate through matches so a real deadline AFTER the fallback in the
  // same description still gets picked up.
  {
    const tier1eRe = new RegExp(
      `\\bby\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?,?\\s*(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm))\\s*([A-Z]{2,4})?`,
      'gi'
    );
    let mm: RegExpExecArray | null;
    while ((mm = tier1eRe.exec(cleanDesc)) !== null) {
      const after = cleanDesc.slice(
        mm.index + mm[0].length,
        mm.index + mm[0].length + 200
      );
      // Cancellation-fallback: skip if the resolution outcome nearby is "Other".
      // Polymarket descriptions use curly quotes (U+2018/2019, U+201C/201D)
      // around outcomes, so include those in the optional-quote char class.
      if (/resolve\s+to\s+["'‘’“”]?(?:Other|other)["'‘’“”]?/.test(after)) {
        continue;
      }
      const mon = parseMonth(mm[1]);
      const day = parseInt(mm[2]);
      const yr = mm[3] ? parseInt(mm[3]) : extractYear(mon, day);
      const timePart = mm[4];
      const tzStr = mm[5] ?? '';
      const parsed = parseTimeStr(timePart);
      const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? 0;
      if (parsed) {
        if (out) out.tier = '1e';
        return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
      }
    }
  }

  // ── Tier 2a: "scheduled for [Month Day] at [Time]" ────────────────────────
  m = new RegExp(
    `scheduled\\s+(?:for|to\\s+(?:take\\s+place|begin|start))?\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?)\\s*([A-Z]{2,4})?`,
    'i'
  ).exec(combined);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const timePart = m[4];
    const tzStr = m[5] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? 0;
    const sportDur = detectSportDuration(combined);
    if (parsed) {
      if (out) out.tier = '2a';
      const startTs = toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
      return startTs + Math.floor((sportDur ?? 3) * 3600);
    }
  }

  // ── Tier 2b: "scheduled for [Month Day]" (no time) ────────────────────────
  m = new RegExp(
    `scheduled\\s+(?:for|to\\s+take\\s+place\\s+(?:on|in))?\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
    'i'
  ).exec(combined);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    const sportDur = detectSportDuration(combined);
    if (out) out.tier = '2b';
    if (sportDur !== null) {
      // Sports market: existing behavior — stamp 23:59 UTC and add a pad
      // representing typical game length. Treated as an opaque integer
      // adjustment, not a timezone math — the offset is "absorbed" by the
      // pad in practice (4h pad ≈ end-of-day ET converted to UTC).
      return toTs(yr, mon, day, 23, 59) + Math.floor(sportDur * 3600);
    }
    // Non-sports scheduled event: stamp 23:59 in an explicit-or-inferred
    // timezone, DST-aware. US-themed → ET; UK-themed → London; fallback UTC.
    // No sport-duration pad — there's no game to wait through.
    const explicit = detectTzIana(combined);
    const contextual = explicit ? null : inferContextZone(combined);
    const iana = explicit ?? contextual;
    const tzOff = iana ? getDstAwareOffsetHours(yr, mon, day, iana) : 0;
    return toTs(yr, mon, day, 23, 59, tzOff);
  }

  // ── Tier 2c: "scheduled for YYYY-MM-DD" (ISO date) ────────────────────────
  m = /scheduled\s+for\s+(\d{4})-(\d{2})-(\d{2})/i.exec(combined);
  if (m) {
    const yr = parseInt(m[1]);
    const mon = parseInt(m[2]);
    const day = parseInt(m[3]);
    const sportDur = detectSportDuration(combined);
    if (out) out.tier = '2c';
    if (sportDur !== null) {
      return toTs(yr, mon, day, 23, 59) + Math.floor(sportDur * 3600);
    }
    const explicit = detectTzIana(combined);
    const contextual = explicit ? null : inferContextZone(combined);
    const iana = explicit ?? contextual;
    const tzOff = iana ? getDstAwareOffsetHours(yr, mon, day, iana) : 0;
    return toTs(yr, mon, day, 23, 59, tzOff);
  }

  // ── Tier 3a: "resolves by [Month Day]" date only (description only) ────────
  m = new RegExp(
    `resolv\\w*\\s+(?:by|before|on|after)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
    'i'
  ).exec(cleanDesc);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    if (out) out.tier = '3a';
    return toTs(yr, mon, day);
  }

  // ── Tier 3b: "checked/measured on [Month Day]" (description only) ──────────
  m = new RegExp(
    `(?:checked?|measured?|determined?)\\s+(?:on|at)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
    'i'
  ).exec(cleanDesc);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = m[3] ? parseInt(m[3]) : extractYear(mon, day);
    if (out) out.tier = '3b';
    return toTs(yr, mon, day);
  }

  // ── Tier 4: Weather + city timezone ──────────────────────────────────────
  if (
    /\b(?:temperature|rain|snow|precip|weather|high|low|wind|humid|fog|cloud)\b/i.test(
      combined
    )
  ) {
    let cityMatch: [string, number] | null = null;
    for (const [city, off] of Object.entries(CITY_TZ_OFFSET)) {
      if (
        new RegExp(
          `\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        ).test(combined)
      ) {
        cityMatch = [city, off];
        break;
      }
    }

    const dm = new RegExp(
      `\\b(${MONTHS})\\s+(\\d{1,2})(?!\\d)(?:[-–](\\d{1,2}))?(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
      'i'
    ).exec(question);
    if (dm) {
      const mon = parseMonth(dm[1]);
      // Use end of range if present (e.g. "March 23-29" → 29), else use the single day
      const day = dm[3] ? parseInt(dm[3]) : parseInt(dm[2]);
      const yr = dm[4] ? parseInt(dm[4]) : extractYear(mon, day);
      const tzOff = cityMatch ? cityMatch[1] : 0;
      if (out) out.tier = '4weather';
      return toTs(yr, mon, day, 23, 59, tzOff);
    }
  }

  // ── Tier 4a: "by [Month Day, Year]" in question ────────────────────────────
  m = new RegExp(
    `\\bby\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`,
    'i'
  ).exec(question);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = parseInt(m[3]);
    if (out) out.tier = '4a';
    return toTs(yr, mon, day);
  }

  // ── Tier 4b: "on/for [Month Day, Year]" in question ────────────────────────
  m = new RegExp(
    `\\b(?:on|for)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`,
    'i'
  ).exec(question);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = parseInt(m[3]);
    if (out) out.tier = '4b';
    return toTs(yr, mon, day);
  }

  // ── Tier 4c: "[Month Day] at [Time TZ]" in question ───────────────────────
  m = new RegExp(
    `\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM)?)\\s*([A-Z]{2,4})?`,
    'i'
  ).exec(question);
  if (m) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = extractYear(mon, day);
    const timePart = m[3];
    const tzStr = m[4] ?? '';
    const parsed = parseTimeStr(timePart);
    const tzOff = (tzStr ? tzOffsetForDate(tzStr, yr, mon, day) : null) ?? 0;
    if (parsed) {
      if (out) out.tier = '4c';
      return toTs(yr, mon, day, parsed.h, parsed.m, tzOff);
    }
  }

  // ── Tier 4stock: stock weekly — "week of [Month Day]" + "final day of trading" ──
  // Both signals required: question has "week of Month Day", description has "final day of trading".
  // Returns NYSE Friday close: the Monday of the stated week + 4 days, at 20:00 UTC (4PM ET).
  if (/final day of trading/i.test(desc)) {
    m = new RegExp(`\\bweek of\\s+(${MONTHS})\\s+(\\d{1,2})`, 'i').exec(
      question
    );
    if (m) {
      const mon = parseMonth(m[1]);
      const monDay = parseInt(m[2]); // Monday of the week
      // Add 4 days to get to Friday; use a placeholder year for safe date arithmetic
      const fridayDate = new Date(Date.UTC(2000, mon - 1, monDay + 4));
      const fridayMon = fridayDate.getUTCMonth() + 1;
      const fridayDay = fridayDate.getUTCDate();
      const yr = extractYear(fridayMon, fridayDay);
      if (out) out.tier = '4stock';
      return toTs(yr, fridayMon, fridayDay, 20, 0); // NYSE close: 4PM ET = 20:00 UTC
    }
  }

  // ── Tier 4d: "by [Month Day]" no year in question ─────────────────────────
  m = new RegExp(
    `\\bby\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\s*,?\\s*\\d{4})`,
    'i'
  ).exec(question);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    if (out) out.tier = '4d';
    return toTs(extractYear(mon, day), mon, day);
  }

  // ── Tier 4e: "on/for/between [Month Day]" no year in question ──────────────
  m = new RegExp(
    `\\b(?:on|for|between)\\s+(${MONTHS})\\s+(\\d{1,2})(?:[-–](\\d{1,2}))?(?:st|nd|rd|th)?(?!\\s*,?\\s*\\d{4})`,
    'i'
  ).exec(question);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    // Use end of range if present (e.g. "on March 23-29" → 29)
    const day = m[3] ? parseInt(m[3]) : parseInt(m[2]);
    if (out) out.tier = '4e';
    return toTs(extractYear(mon, day), mon, day);
  }

  // ── Tier 4f: "[Month Day, Year]" anywhere in question ─────────────────────
  m = new RegExp(
    `\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`,
    'i'
  ).exec(question);
  if (m && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const day = parseInt(m[2]);
    const yr = parseInt(m[3]);
    if (out) out.tier = '4f';
    return toTs(yr, mon, day);
  }

  // ── Tier 4month: "in [Month [Year]]" for crypto monthly markets ───────────
  // "Will Bitcoin reach $X in March?" → last day of March at 23:59 UTC.
  // Scoped to crypto assets to avoid false positives on non-month-end markets
  // (e.g. "Will the Fed cut rates in March?" resolves mid-month, not end-of-month).
  const CRYPTO_ASSETS_RE =
    /\b(?:Bitcoin|BTC|Ethereum|ETH|Solana|SOL|XRP|Ripple|Dogecoin|DOGE|BNB|Litecoin|LTC|Cardano|ADA|Avalanche|AVAX|Chainlink|LINK|Polkadot|DOT|Uniswap|UNI|Hyperliquid|HYPE|Ethena|ENA)\b/i;
  if (CRYPTO_ASSETS_RE.test(question)) {
    m = new RegExp(`\\bin\\s+(${MONTHS})(?:\\s+(\\d{4}))?`, 'i').exec(question);
    if (m && !hasTimingMarker) {
      const mon = parseMonth(m[1]);
      // Compute last day using approximate current year, then confirm year using that last day
      const approxLastDay = new Date(
        Date.UTC(new Date().getUTCFullYear(), mon, 0)
      ).getUTCDate();
      const yr = m[2] ? parseInt(m[2]) : extractYear(mon, approxLastDay);
      const lastDay = new Date(Date.UTC(yr, mon, 0)).getUTCDate();
      if (out) out.tier = '4month';
      return toTs(yr, mon, lastDay, 23, 59);
    }
  }

  // ── Tier 4month2: "in [Month [Year]]" for non-crypto markets ──────────────
  // Generalised version of 4month. Catches "Will Trump say X in April?",
  // weather/econ "in April 2026", etc. Resolves to last day of month 23:59 UTC.
  // Placed late so more-specific tiers (4weather, 4a–4f) take precedence.
  // Excludes central bank / monetary policy questions — those resolve mid-month
  // on the meeting date, not end-of-month.
  const CENTRAL_BANK_RE =
    /\b(?:Fed\b|Federal Reserve|ECB|FOMC|Bank of (?:England|Japan|Canada)|BoE|BoJ|BoC|RBA|interest rate|rate (?:cut|hike|hold|decision)|funds rate|basis points?\b|bps\b)/i;
  m = new RegExp(`\\bin\\s+(${MONTHS})(?:\\s+(\\d{4}))?\\s*\\??$`, 'i').exec(
    question
  );
  if (m && !CENTRAL_BANK_RE.test(question) && !hasTimingMarker) {
    const mon = parseMonth(m[1]);
    const approxLastDay = new Date(
      Date.UTC(new Date().getUTCFullYear(), mon, 0)
    ).getUTCDate();
    const yr = m[2] ? parseInt(m[2]) : extractYear(mon, approxLastDay);
    const lastDay = new Date(Date.UTC(yr, mon, 0)).getUTCDate();
    if (out) out.tier = '4month2';
    return toTs(yr, mon, lastDay, 23, 59);
  }

  // ── Tier 4week: "this week" → next Sunday 23:59 ET ──────────────────────
  if (/\bthis\s+week\b/i.test(question) && !hasTimingMarker) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const sunday = new Date(now.getTime() + daysUntilSunday * 86400 * 1000);
    if (out) out.tier = '4week';
    return toTs(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth() + 1,
      sunday.getUTCDate(),
      23,
      59,
      -4 // ET
    );
  }

  // Tier 6: no date found
  if (out) out.tier = '6';
  return null;
}
