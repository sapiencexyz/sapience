import { mlbEndTime } from './mlb';
import { nbaEndTime } from './nba';
import { nflEndTime } from './nfl';
import { nhlEndTime } from './nhl';

/** Per-sport extractors, tried in order; first non-null wins. */
export const SPORT_EXTRACTORS: Array<(q: string) => number | null> = [
  nflEndTime,
  nhlEndTime,
  nbaEndTime,
  mlbEndTime,
];

/** Dispatch a sports market to whichever per-sport extractor matches. */
export function sportsEndTime(question: string): number | null {
  for (const fn of SPORT_EXTRACTORS) {
    const r = fn(question);
    if (r != null) return r;
  }
  return null;
}

export { nflEndTime, nhlEndTime, nbaEndTime, mlbEndTime };
