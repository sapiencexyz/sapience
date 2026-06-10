/// <reference types="node" />
import { endOfDayET, toSec } from '../shared';

/** NFL season / league championship -> Super Bowl (~2nd Sunday of February). */
export function nflEndTime(question: string): number | null {
  const m =
    question.match(/(20\d{2})\s+NFL\b/i) ??
    question.match(/super\s*bowl[^0-9]*(20\d{2})/i);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const known: Record<number, number> = { 2026: 8, 2027: 14, 2028: 13 };
  return toSec(endOfDayET(year, 1, known[year] ?? 9));
}
