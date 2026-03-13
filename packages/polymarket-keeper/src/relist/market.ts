/**
 * Fetch Polymarket markets with past endDates that are still actively traded
 */

import type { PolymarketMarket } from '../types';
import { RELIST_LOOKBACK_DAYS } from '../constants';
import { fetchWithRetry } from '../utils';
import {
  runPipeline,
  printPipelineStats,
  MARKET_FILTERS,
} from '../generate/pipeline';

const PAGE_SIZE = 500;

/**
 * Fetch markets whose endDate is in the past (within the lookback window)
 * but are still active and not closed/archived on Polymarket.
 */
export async function fetchPastEndDateMarkets(): Promise<PolymarketMarket[]> {
  const now = new Date();
  const minEndDate = new Date(
    now.getTime() - RELIST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const allMarkets: PolymarketMarket[] = [];
  const seenConditionIds = new Set<string>();
  let pageCount = 0;
  let offset = 0;

  console.log(
    `[Relist] Fetching past-endDate markets from ${minEndDate.toISOString()} to ${now.toISOString()}...`
  );

  while (true) {
    pageCount++;
    // Fetch active, not closed, not archived markets with past endDates
    const url =
      `https://gamma-api.polymarket.com/markets?limit=${PAGE_SIZE}&offset=${offset}` +
      `&active=true&closed=false&archived=false` +
      `&order=endDate&ascending=false` +
      `&end_date_min=${minEndDate.toISOString()}&end_date_max=${now.toISOString()}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(
        `[Polymarket API] Failed to fetch past-endDate markets: HTTP ${response.status} ${response.statusText}`
      );
      if (errorBody)
        console.error(`[Polymarket API] Response body: ${errorBody}`);
      throw new Error(
        `Polymarket API error: ${response.status} ${response.statusText}`
      );
    }

    const markets: PolymarketMarket[] = await response.json();

    if (markets.length === 0) {
      console.log(`[Relist] Page ${pageCount}: No more markets`);
      break;
    }

    console.log(
      `[Relist] Page ${pageCount}: Fetched ${markets.length} markets`
    );

    // Deduplicate and filter out archived markets (client-side safety net)
    let newMarketsCount = 0;
    for (const m of markets) {
      if (m.archived) continue;
      // Also filter client-side for endDate < now in case end_date_max isn't supported
      if (new Date(m.endDate) >= now) continue;
      if (!seenConditionIds.has(m.conditionId)) {
        seenConditionIds.add(m.conditionId);
        allMarkets.push(m);
        newMarketsCount++;
      }
    }

    // Stop conditions:
    // 1. Got less than PAGE_SIZE markets (no more pages)
    // 2. No new markets added (all duplicates or filtered)
    if (markets.length < PAGE_SIZE || newMarketsCount === 0) {
      break;
    }

    offset += PAGE_SIZE;
  }

  console.log(
    `[Relist] Total fetched: ${allMarkets.length} markets across ${pageCount} pages`
  );

  // Apply market filters pipeline (binary markets filter)
  const { output: filteredMarkets, stats } = runPipeline(
    allMarkets,
    MARKET_FILTERS,
    {
      verbose: false,
    }
  );

  printPipelineStats(stats, 'Relist Market Pipeline');

  return filteredMarkets;
}
