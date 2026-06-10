/// <reference types="node" />
import { parseEtDateTime } from './et-datetime';

/**
 * Mention + social-post-count endTime extractor.
 *
 * Two Polymarket families state their resolution window verbatim in the
 * description, and the window's UPPER bound IS the resolution moment:
 *
 *   - Mention ("What will X say" / "What will X post on Truth Social"):
 *       "...mentions the listed term between <D1> and <D2>."
 *       "...posts/truths the listed term between <D1> and <D2>." (Truth Social)
 *   - Social-post count ("# tweets / # posts / # Truth Social posts"):
 *       "...posts on X|Truth Social from <D1> to <D2>."   (Elon variant)
 *       "...posts on X|Truth Social between <D1> and <D2>." (everyone else)
 *
 * Both repeat byte-for-byte across every week/event, so a regex on the
 * description gives the exact resolution time. Verified at 100% parse on the
 * labeler corpus and a live Gamma harvest, exact-matching all human labels.
 *
 * Why this beats Polymarket's endDate: for the mention weeklies/monthlies PM
 * stores `endDate` as midnight-UTC of the final day (~28h early), while the
 * description says 11:59 PM ET. The description is the contractual resolution
 * time, so we read it directly. Returns unix SECONDS, or null when neither
 * signature is present (e.g. the "next podcast episode" markets carry no
 * window) so the caller falls through to the rest of the cascade.
 *
 * The dates are parsed in ET (the only timezone these templates use), DST-aware
 * via the shared America/New_York helper — so a January window resolves at EST
 * and a July one at EDT without hard-coding the offset.
 */

// Anchored on the stable resolution verb so we never match a stray "...ET..."
// elsewhere in the description. Each captures (D1, D2); we only use D2.
const WINDOW_PATTERNS: RegExp[] = [
  /(?:mentions|posts\/truths) the listed term between\s+(.+?ET)\s+and\s+(.+?ET)/i,
  /posts on (?:X|Truth Social)\s+from\s+(.+?ET)\s+to\s+(.+?ET)/i,
  /posts on (?:X|Truth Social)\s+between\s+(.+?ET)\s+and\s+(.+?ET)/i,
];

export function socialEndTime(
  _question: string,
  description: string
): number | null {
  const desc = description ?? '';
  for (const pattern of WINDOW_PATTERNS) {
    const win = pattern.exec(desc);
    if (!win) continue;
    // win[2] is the window's upper bound (the lower bound, win[1], is ignored);
    // it always carries a full "Month D, YYYY[,] time ET" timestamp.
    const ts = parseEtDateTime(win[2]);
    if (ts != null) return ts;
  }
  return null;
}
