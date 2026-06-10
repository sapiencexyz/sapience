/// <reference types="node" />
import { extractEndTime } from '../endtime';

import { extractCategoryEndTime } from './index';
import { gameEndTime } from './sports/game';

/** Corpus fields the cascade reads. */
export type CascadeInput = {
  question: string;
  description: string;
  tag?: string | null;
  gameStartTime?: string | null;
  league?: string | null;
  endDate?: string | null;
  /**
   * Precomputed LLM endTime (unix seconds), mirroring production's
   * `c.llmEndTime.ts`. Batched upstream; the cascade just consumes it. Leave
   * null/undefined to skip the LLM rung (e.g. when it hasn't been run).
   */
  llmEndTime?: number | null;
};

/**
 * Production endTime cascade. Each rung fits-or-declines (returns null), so the
 * first non-null wins:
 *   1. game        — gameStartTime + per-league offset (exact + free)
 *   2. category    — weather / crypto / sports-championship specialists (exact + free)
 *   3. LLM         — precomputed llmEndTime; smart generalist for the hard tail.
 *                    Sits ABOVE regex because regex returns confident WRONG dates
 *                    (wrong-year tail) rather than declining — so it must not
 *                    out-rank the LLM's answer.
 *   4. regex       — general in-text date extraction (cheap catch for LLM declines)
 *   5. endDate+1d  — floor; keeps coverage ~99% when everything else whiffs
 * Returns unix SECONDS or null.
 */
export function bestEndTime(input: CascadeInput): number | null {
  const {
    question,
    description,
    tag,
    gameStartTime,
    league,
    endDate,
    llmEndTime,
  } = input;

  const game = gameEndTime(gameStartTime, league);
  if (game != null) return game;

  const cat = extractCategoryEndTime(question, description, tag);
  if (cat != null) return cat;

  if (llmEndTime != null) return llmEndTime;

  const rgx = extractEndTime(question, description);
  if (rgx != null) return rgx;

  if (endDate) {
    const t = Date.parse(endDate);
    if (Number.isFinite(t)) return Math.round(t / 1000) + 86_400;
  }
  return null;
}
