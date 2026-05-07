/**
 * Filter: rescue low-volume children of a Polymarket negRisk basket when at
 * least one sibling in the same event passes the standard volume+liquidity
 * thresholds. A negRisk event is a set of mutually-exclusive binary markets
 * where exactly one resolves YES — admitting only the high-volume legs would
 * leave the basket incomplete and break the conversion identity
 * NO_i ≡ Σ YES_j (j ≠ i) on our side.
 */

import type { Filter, FilterResult } from '../types';
import {
  MIN_VOLUME_THRESHOLD,
  MIN_LIQUIDITY_THRESHOLD,
} from '../../../constants';
import type { MarketGroup } from './volume-threshold';

export class NegRiskBasketRescueFilter implements Filter<MarketGroup> {
  name = 'neg-risk-basket-rescue';
  description =
    'Keep negRisk children whose event has at least one sibling passing volume+liquidity';

  apply(groups: MarketGroup[]): FilterResult<MarketGroup> {
    // Identify negRisk events with at least one child that already clears
    // both thresholds on its own. Keying off the Polymarket event id (not
    // title) is deliberate — different events can share a title.
    const eventsWithPassingChild = new Set<string>();
    for (const group of groups) {
      for (const market of group.markets) {
        if (!market.negRisk) continue;
        const eventId = market.events?.[0]?.id;
        if (!eventId) continue;
        const volume = parseFloat(market.volume || '0');
        const liquidity = parseFloat(market.liquidity || '0');
        if (
          volume >= MIN_VOLUME_THRESHOLD &&
          liquidity >= MIN_LIQUIDITY_THRESHOLD
        ) {
          eventsWithPassingChild.add(eventId);
        }
      }
    }

    const kept: MarketGroup[] = [];
    const removed: MarketGroup[] = [];
    // Marginal rescues = groups this branch keeps that the volume+liquidity
    // branch would have dropped. Total kept also counts siblings that pass on
    // their own — those would survive without us, so they don't count as
    // "rescued."
    let marginalRescued = 0;
    for (const group of groups) {
      const isRescuedSibling = group.markets.some((m) => {
        if (!m.negRisk) return false;
        const eventId = m.events?.[0]?.id;
        return !!eventId && eventsWithPassingChild.has(eventId);
      });
      if (isRescuedSibling) {
        kept.push(group);
        const failsOnOwn = group.markets.every((m) => {
          const v = parseFloat(m.volume || '0');
          const l = parseFloat(m.liquidity || '0');
          return v < MIN_VOLUME_THRESHOLD || l < MIN_LIQUIDITY_THRESHOLD;
        });
        if (failsOnOwn) marginalRescued++;
      } else {
        removed.push(group);
      }
    }

    console.log(
      `[neg-risk-basket-rescue] baskets=${eventsWithPassingChild.size} ` +
        `kept=${kept.length} marginal=${marginalRescued} ` +
        `(marginal = legs that would have failed volume+liquidity on their own)`
    );

    return { kept, removed };
  }
}
