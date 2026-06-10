/// <reference types="node" />
import { endOfDayET, toSec } from '../shared';

/** NBA season -> Finals (~mid-to-late June). */
export function nbaEndTime(question: string): number | null {
  const m = question.match(/(20\d{2})\s+NBA\b/i);
  if (!m) return null;
  return toSec(endOfDayET(parseInt(m[1], 10), 5, 20));
}
