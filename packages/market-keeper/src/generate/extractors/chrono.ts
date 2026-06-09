/// <reference types="node" />
import * as chrono from 'chrono-node';

/**
 * Generic natural-language date extraction via chrono-node — a baseline to put
 * next to the hand-rolled regex / specialized extractors. Parses the question
 * first (more reliable), then the description; takes the LAST date it finds
 * (usually the deadline). Returns unix SECONDS or null.
 */
const REF = new Date(Date.UTC(2026, 5, 4)); // labeling snapshot for relative dates

export function chronoEndTime(
  question: string,
  description: string
): number | null {
  for (const text of [question, description]) {
    if (!text) continue;
    const results = chrono.parse(text, REF, { forwardDate: true });
    if (results.length > 0) {
      const t = results[results.length - 1].date().getTime();
      if (Number.isFinite(t)) return Math.round(t / 1000);
    }
  }
  return null;
}
