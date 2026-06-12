/**
 * Resolve specific Polymarket event slugs into the SAME canonical market
 * objects the `generate` cron consumes, so the manual add-events path and the
 * cron stay in lockstep.
 *
 * Why two hops (/events then /markets): the /events?slug= endpoint embeds its
 * markets but omits the event-level `seriesSlug`/`series` and per-market
 * `gameStartTime` that the endTime cascade (leagueForMarket → gameEndTime)
 * relies on — and its markets carry no `events[]` embed at all. The /markets
 * endpoint returns the full embed. So we hit /events only to discover the
 * event's market conditionIds, then re-fetch those exact markets via
 * `fetchMarketsByConditionIds` to get generate's representation verbatim.
 *
 * After re-fetching we mirror `fetchEndingSoonestMarkets`' post-fetch
 * processing: drop closed/archived/inactive markets (the cron filters these at
 * the /markets query level) and run the binary `MARKET_FILTERS`. We do NOT
 * apply the 21-day window — bypassing it is the entire point of add-events.
 */

import type { PolymarketMarket } from '../types';
import { fetchWithRetry } from '../utils';
import { fetchMarketsByConditionIds } from '../refresh-metadata/fetch';
import { runPipeline, printPipelineStats, MARKET_FILTERS } from './pipeline';

interface PolymarketEventLite {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  markets?: Array<{ conditionId?: string }>;
}

/**
 * Keep only markets the generate cron would: active, not closed, not archived.
 * The cron enforces this via `active=true&closed=false` on the /markets query;
 * add-events fetches by conditionId (which returns resolved legs too), so the
 * gate is applied here instead.
 */
export function isTradeableMarket(market: PolymarketMarket): boolean {
  return (
    market.active === true && market.closed !== true && market.archived !== true
  );
}

/**
 * Resolve event slugs to the conditionIds of their markets, deduped across
 * slugs (passing overlapping slugs must not create duplicates). A slug that
 * fails to fetch or matches no event is logged and skipped — the rest proceed.
 */
export async function fetchConditionIdsForSlugs(
  slugs: string[]
): Promise<string[]> {
  const ids = new Set<string>();

  for (const slug of slugs) {
    const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`;
    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(
        `[Polymarket] Failed to fetch event "${slug}": HTTP ${response.status}`
      );
      continue;
    }

    const events: PolymarketEventLite[] = await response.json();
    if (events.length === 0) {
      console.warn(`[Polymarket] No event found for slug "${slug}"`);
      continue;
    }

    let count = 0;
    for (const event of events) {
      for (const market of event.markets ?? []) {
        if (market.conditionId) {
          ids.add(market.conditionId);
          count++;
        }
      }
    }
    console.log(
      `[Polymarket] Event slug "${slug}": ${count} markets (${ids.size} unique so far)`
    );
  }

  return [...ids];
}

/**
 * Fetch the canonical, generate-equivalent markets for a set of event slugs.
 * Returns markets ready to hand to `groupMarkets` exactly as the cron does.
 */
export async function fetchMarketsForEventSlugs(
  slugs: string[]
): Promise<PolymarketMarket[]> {
  const conditionIds = await fetchConditionIdsForSlugs(slugs);
  if (conditionIds.length === 0) return [];

  // Re-fetch via /markets to get the full embed (seriesSlug/series,
  // gameStartTime) and dedup by conditionId for free (Map-keyed).
  const marketMap = await fetchMarketsByConditionIds(conditionIds);
  const tradeable = [...marketMap.values()].filter(isTradeableMarket);

  console.log(
    `[Polymarket] Re-fetched ${marketMap.size}/${conditionIds.length} markets; ` +
      `${tradeable.length} active after closed/archived gate`
  );

  // Same binary filter the cron applies in fetchEndingSoonestMarkets.
  const { output, stats } = runPipeline(tradeable, MARKET_FILTERS, {
    verbose: false,
  });
  printPipelineStats(stats, 'Market Pipeline');

  return output;
}
