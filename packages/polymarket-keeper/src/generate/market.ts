/**
 * Market fetching and filtering utilities
 */

import type { PolymarketMarket, SapienceCondition } from '../types';
import { fetchWithRetry } from '../utils';
import {
  runPipeline,
  printPipelineStats,
  MARKET_FILTERS,
  // matchesAlwaysIncludePatterns,
} from './pipeline';

// Re-export for backward compatibility
// export { matchesAlwaysIncludePatterns };

// /**
//  * Check if a market should always be included regardless of volume
//  */
// export function shouldAlwaysInclude(market: PolymarketMarket): boolean {
//   return matchesAlwaysIncludePatterns(market.question || '');
// }

// /**
//  * Check if a condition should always be included regardless of category
//  */
// export function shouldAlwaysIncludeCondition(condition: SapienceCondition): boolean {
//   return matchesAlwaysIncludePatterns(condition.question || '');
// }

/**
 * Fetch markets that end soonest (for --ending-soon mode)
 * Orders by endDate ascending, no volume sorting
 * Iteratively fetches pages by moving end_date_min based on max endDate from previous response
 */
export async function fetchEndingSoonestMarkets(): Promise<PolymarketMarket[]> {
  // Minimum end time: current time + 1 minute (ISO format for API)
  let currentMinEndDate = new Date(Date.now() + 60 * 1000).toISOString();
  // Maximum end time: current time + 7 days
  const maxEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const allMarkets: PolymarketMarket[] = [];
  const seenConditionIds = new Set<string>(); // Track seen markets to deduplicate
  const PAGE_SIZE = 500;
  let pageCount = 0;

  console.log(`[Polymarket] Fetching ending-soon markets until ${maxEndDate.toISOString()}...`);

  while (true) {
    pageCount++;
    const url = `https://gamma-api.polymarket.com/markets?limit=${PAGE_SIZE}&active=true&closed=false&order=endDate&ascending=true&end_date_min=${currentMinEndDate}`;

    const response = await fetchWithRetry(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[Polymarket API] Failed to fetch ending-soon markets: HTTP ${response.status} ${response.statusText}`);
      if (errorBody) console.error(`[Polymarket API] Response body: ${errorBody}`);
      throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
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

    console.log(`[Polymarket] Page ${pageCount}: Fetched ${markets.length} markets (max endDate: ${maxEndDateInBatch.toISOString()})`);

    // Add markets that are within our time window
    const marketsInWindow = markets.filter(m => new Date(m.endDate) < maxEndDate);

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
    if (markets.length < PAGE_SIZE || maxEndDateInBatch >= maxEndDate || newMarketsCount === 0) {
      break;
    }

    // Move the cursor to fetch next page (use exact time, dedup handles overlap)
    currentMinEndDate = maxEndDateInBatch.toISOString();
  }

  console.log(`[Polymarket] Total fetched: ${allMarkets.length} markets across ${pageCount} pages`);

  // Apply market filters pipeline (binary markets filter)
  const { output: filteredMarkets, stats } = runPipeline(
    allMarkets,
    MARKET_FILTERS,
    { verbose: false }
  );

  printPipelineStats(stats, 'Market Pipeline');

  return filteredMarkets;
}
