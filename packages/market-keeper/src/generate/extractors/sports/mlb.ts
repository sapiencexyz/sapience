/// <reference types="node" />
import { endOfDayET, toSec } from '../shared';

/** MLB season -> World Series (~end of October). */
export function mlbEndTime(question: string): number | null {
  const m =
    question.match(/(20\d{2})[^.]*world series/i) ??
    question.match(/world series[^0-9]*(20\d{2})/i);
  if (!m) return null;
  return toSec(endOfDayET(parseInt(m[1], 10), 9, 31));
}
