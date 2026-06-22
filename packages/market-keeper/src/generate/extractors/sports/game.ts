/// <reference types="node" />
import { toSec } from '../shared';

/**
 * Per-league game duration (minutes), calibrated from (umaEndDate − gameStartTime)
 * on closed games. The resolution of a game market ≈ gameStartTime + this offset.
 *
 * Ball sports are tight (~±1h p10–p90) so they're effectively precise; esports
 * (series/BO formats), combat sports (card timing + variable fight length) and
 * cricket (T20/ODI/Test) are high-variance, so their results are imprecise — keep
 * a wide tolerance for those (see the calibration p10–p90).
 */
export const LEAGUE_DURATION_MIN: Record<string, number> = {
  // ball sports — tight
  mlb: 188,
  nba: 209,
  nhl: 234,
  nfl: 210,
  soccer: 179,
  tennis: 236,
  wnba: 206,
  // esports — series formats, wider
  'league-of-legends': 362,
  valorant: 281,
  'counter-strike-2': 293,
  'dota-2': 215,
  esports: 250,
  // high variance
  ufc: 526,
  boxing: 769,
  cricket: 487,
  'table-tennis': 410,
};

/** League tags (also the fetch list). */
export const SPORT_LEAGUES = Object.keys(LEAGUE_DURATION_MIN);

/** Normalize "2026-06-10 19:45:00+00" (or ISO) to epoch ms, or null. */
function parseGameStart(gst: string): number | null {
  const iso = gst.replace(' ', 'T').replace(/\+00$/, 'Z');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Resolution time (unix SECONDS) for a game market = gameStartTime + the
 * per-league median duration.
 *
 * Sports-only: returns null when there's no gameStartTime (e.g. unscheduled
 * match, or a futures/championship market) AND when there's no recognized
 * sports league — Polymarket attaches a gameStartTime to some non-sports
 * markets (e.g. S&P 500 index price markets), and the game rung must decline
 * those so the cascade falls through instead of inventing a default duration.
 */
export function gameEndTime(
  gameStartTime: string | null | undefined,
  league: string | null | undefined
): number | null {
  if (!gameStartTime) return null;
  const mins = league ? LEAGUE_DURATION_MIN[league] : undefined;
  if (mins == null) return null;
  const start = parseGameStart(gameStartTime);
  if (start == null) return null;
  return toSec(start + mins * 60_000);
}
