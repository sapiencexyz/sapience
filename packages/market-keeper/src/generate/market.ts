/**
 * Market fetching and filtering utilities
 */

import type { PolymarketMarket } from '../types';
import { MAX_END_DATE_DAYS, SUPPLEMENTARY_EVENT_TAGS } from '../constants';
import { fetchWithRetry } from '../utils';
import { runPipeline, printPipelineStats, MARKET_FILTERS } from './pipeline';

/**
 * Fetch markets that end soonest (for --ending-soon mode)
 * Orders by endDate ascending, no volume sorting
 * Iteratively fetches pages by moving end_date_min based on max endDate from previous response
 */
export async function fetchEndingSoonestMarkets(): Promise<PolymarketMarket[]> {
  // Minimum end time: current time + 1 minute (ISO format for API)
  let currentMinEndDate = new Date(Date.now() + 60 * 1000).toISOString();
  // Maximum end time: current time + MAX_END_DATE_DAYS
  const maxEndDate = new Date(
    Date.now() + MAX_END_DATE_DAYS * 24 * 60 * 60 * 1000
  );

  const allMarkets: PolymarketMarket[] = [];
  const seenConditionIds = new Set<string>(); // Track seen markets to deduplicate
  const PAGE_SIZE = 500;
  let pageCount = 0;
  let offset = 0;

  console.log(
    `[Polymarket] Fetching ending-soon markets until ${maxEndDate.toISOString()}...`
  );

  while (true) {
    pageCount++;
    const url = `https://gamma-api.polymarket.com/markets?limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=endDate&ascending=true&end_date_min=${currentMinEndDate}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(
        `[Polymarket API] Failed to fetch ending-soon markets: HTTP ${response.status} ${response.statusText}`
      );
      if (errorBody)
        console.error(`[Polymarket API] Response body: ${errorBody}`);
      throw new Error(
        `Polymarket API error: ${response.status} ${response.statusText}`
      );
    }

    const markets: PolymarketMarket[] = await response.json();

    if (markets.length === 0) {
      console.log(`[Polymarket] Page ${pageCount}: No more markets`);
      break;
    }

    // Find the max endDate in this batch to use as next page's min
    const maxEndDateInBatch = markets.reduce((max, m) => {
      const endDate = new Date(m.endDate);
      return endDate > max ? endDate : max;
    }, new Date(0));

    console.log(
      `[Polymarket] Page ${pageCount}: Fetched ${markets.length} markets (max endDate: ${maxEndDateInBatch.toISOString()})`
    );

    // Add markets that are within our time window
    const marketsInWindow = markets.filter(
      (m) => new Date(m.endDate) < maxEndDate
    );

    // Deduplicate and add markets that are within our time window
    let newMarketsCount = 0;
    for (const m of marketsInWindow) {
      if (!seenConditionIds.has(m.conditionId)) {
        seenConditionIds.add(m.conditionId);
        allMarkets.push(m);
        newMarketsCount++;
      }
    }

    // Stop conditions:
    // 1. Got less than PAGE_SIZE markets (no more pages)
    // 2. Max endDate in batch exceeds our window (all remaining markets are beyond our window)
    // 3. No new markets added (we've seen all markets at this endDate)
    if (
      markets.length < PAGE_SIZE ||
      maxEndDateInBatch >= maxEndDate ||
      newMarketsCount === 0
    ) {
      break;
    }

    // Move the cursor to fetch next page
    const newMinEndDate = maxEndDateInBatch.toISOString();
    if (newMinEndDate === currentMinEndDate) {
      // Cursor didn't advance — many markets share the same endDate.
      // Use offset to page through them.
      offset += PAGE_SIZE;
    } else {
      currentMinEndDate = newMinEndDate;
      offset = 0;
    }
  }

  console.log(
    `[Polymarket] Total fetched: ${allMarkets.length} markets across ${pageCount} pages`
  );

  // Fetch supplementary markets from /events endpoint by tag slug.
  // The /markets list endpoint has blind spots where some active markets
  // don't appear in paginated results but are discoverable via event tags.
  const supplementaryMarkets = await fetchMarketsByEventTags(
    SUPPLEMENTARY_EVENT_TAGS,
    maxEndDate
  );

  let supplementaryCount = 0;
  for (const m of supplementaryMarkets) {
    if (!seenConditionIds.has(m.conditionId)) {
      seenConditionIds.add(m.conditionId);
      allMarkets.push(m);
      supplementaryCount++;
    }
  }

  if (supplementaryCount > 0) {
    console.log(
      `[Polymarket] Supplementary event tags added ${supplementaryCount} new markets`
    );
  }

  // Apply market filters pipeline (binary markets filter)
  const { output: filteredMarkets, stats } = runPipeline(
    allMarkets,
    MARKET_FILTERS,
    { verbose: false }
  );

  printPipelineStats(stats, 'Market Pipeline');

  return filteredMarkets;
}

/**
 * Fetch markets from the /events endpoint by tag slugs.
 * Returns flattened market objects from event.markets[].
 * Injects the parent event into each market's `events` array so downstream
 * grouping logic (which reads market.events[0]) works correctly.
 */
async function fetchMarketsByEventTags(
  tagSlugs: string[],
  maxEndDate: Date
): Promise<PolymarketMarket[]> {
  const markets: PolymarketMarket[] = [];

  for (const tag of tagSlugs) {
    const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${encodeURIComponent(tag)}&limit=200`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn(
        `[Polymarket] Failed to fetch events for tag "${tag}": HTTP ${response.status}`
      );
      continue;
    }

    const events: Array<{
      id?: string;
      title?: string;
      slug?: string;
      description?: string;
      markets?: PolymarketMarket[];
    }> = await response.json();

    for (const event of events) {
      const parentEvent = {
        id: event.id,
        title: event.title,
        slug: event.slug,
        description: event.description,
      };

      for (const market of event.markets ?? []) {
        if (new Date(market.endDate) < maxEndDate) {
          // Inject parent event so grouping logic can read market.events[0]
          market.events = [parentEvent];
          markets.push(market);
        }
      }
    }

    console.log(
      `[Polymarket] Tag "${tag}": fetched ${events.length} events with ${markets.length} markets`
    );
  }

  return markets;
}
