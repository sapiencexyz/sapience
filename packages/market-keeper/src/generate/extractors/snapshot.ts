/// <reference types="node" />
import { parseEtDateTime } from './et-datetime';

/**
 * "Ranking snapshot" endTime extractor.
 *
 * A class of Polymarket markets resolves by reading a leaderboard / ranked list
 * at an explicit, stated timestamp — the resolution moment is that snapshot
 * time, given verbatim in the description:
 *
 *   - AI / LLM leaderboards ("best AI model / agent / coding model at end of
 *     <month>"): "...is checked on <date>, <time> ET."
 *   - Netflix weekly Top 10: "...update its Top 10 list on <Day>, <date>,
 *     <time> ET, reflecting viewership from the previous week..."
 *
 * Each family is anchored on its OWN resolution phrase, NOT a generic
 * "snapshot verb + nearby date". The false-positive analysis showed a generic
 * pattern grabs the wrong timestamp on Netflix descriptions (which carry two —
 * the publish time AND a "if not updated by <date>... resolve No" fallback) and
 * leaks onto unrelated markets. The anchors below each select a single,
 * unambiguous timestamp:
 *   - "checked on <ts>" appears once and is the resolution.
 *   - "<ts>, reflecting" tags the publish time specifically, so the fallback
 *     ("...by <date>, 11:59 PM ET, resolve to No") is never matched.
 *
 * Returns unix SECONDS (DST-aware ET) or null when no anchor is present, so the
 * caller falls through to the rest of the cascade.
 */

// Each pattern captures the fragment carrying the resolution timestamp; the
// shared ET parser reads the first "Month D, YYYY[,] time ET" out of it.
const SNAPSHOT_PATTERNS: RegExp[] = [
  // AI/LLM leaderboards (and any "...checked/recorded/measured on <ts>").
  /\b(?:checked|recorded|measured|observed)\s+on\s+([^.]*?ET)\b/i,
  // Netflix Top-10: the publish time is the timestamp immediately before
  // "reflecting" — anchoring here skips the trailing "resolve to No" fallback.
  /([^.]*?ET),?\s+reflecting\b/i,
];

export function snapshotEndTime(
  _question: string,
  description: string
): number | null {
  const desc = description ?? '';
  for (const pattern of SNAPSHOT_PATTERNS) {
    const m = pattern.exec(desc);
    if (!m) continue;
    const ts = parseEtDateTime(m[1]);
    if (ts != null) return ts;
  }
  return null;
}
