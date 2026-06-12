/// <reference types="node" />
import { endOfDayET, toSec } from '../shared';

/** NHL season -> Stanley Cup Final (~mid-June). */
export function nhlEndTime(question: string): number | null {
  const m =
    question.match(/(20\d{2})\s+NHL\b/i) ??
    question.match(/(20\d{2})[^.]*stanley\s*cup/i) ??
    question.match(/stanley\s*cup[^0-9]*(20\d{2})/i);
  if (!m) return null;
  return toSec(endOfDayET(parseInt(m[1], 10), 5, 18));
}
