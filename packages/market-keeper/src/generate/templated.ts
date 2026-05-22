import type { PolymarketMarket } from '../types';

/**
 * Detect whether a Polymarket market was generated from a template (sports
 * moneyline, series candle, price-threshold group, etc.) — as opposed to a
 * one-off human-authored question.
 *
 * Used by the decideEndTime combiner: regex-based endTime extraction is only
 * trusted as a fallback for templated markets, where the format is
 * deterministic by construction. Non-templated markets must come from the LLM
 * or Polymarket endDate.
 */
export function isTemplatedMarket(m: PolymarketMarket): boolean {
  if (m.sportsMarketType) return true;
  const event = m.events?.[0];
  if (event?.seriesSlug) return true;
  if ((event?.series?.length ?? 0) > 0) return true;
  // Templated groups (e.g. "BTC candle: $100k threshold" inside a
  // price-threshold group). This signal is weaker than the two above —
  // Polymarket may use groups for ad-hoc bundling too. Kept in because under
  // LLM-first ordering isTemplated only affects the fallback path (Sonar
  // returned UNKNOWN), so a false positive just means we try regex on a
  // non-templated market in the LLM-down case — low blast radius.
  if (m.marketGroup && m.groupItemTitle) return true;
  return false;
}
