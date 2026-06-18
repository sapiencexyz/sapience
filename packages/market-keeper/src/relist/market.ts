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

// Polymarket's keyset endpoint caps `limit` at 100 server-side.
const PAGE_SIZE = 100;

// Hard backstop on pages walked. At 100 markets/page this covers 1M markets —
// far beyond any real corpus. Its only job is to stop a runaway loop if the API
// ever regresses to echoing a stuck cursor (see stuck-cursor guard below).
const MAX_PAGES = 10000;

/** Shape of the /markets/keyset response envelope (vs the bare array /markets returns). */
interface KeysetPage {
  markets: PolymarketMarket[];
  next_cursor?: string;
}

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
  // Cursors already requested. Polymarket deprecated offset pagination — the
  // /markets endpoint rejects offset > 2000 with HTTP 422 ("use /markets/keyset
  // for deeper pagination"). Keyset pagination has no offset ceiling: each page
  // returns a `next_cursor` we feed back as `after_cursor`. Tracking seen
  // cursors also guards against a stuck cursor looping forever (Polymarket/agents#227).
  const seenCursors = new Set<string>();
  let pageCount = 0;
  let cursor: string | undefined;

  console.log(
    `[Relist] Fetching past-endDate markets from ${minEndDate.toISOString()} to ${now.toISOString()}...`
  );

  while (pageCount < MAX_PAGES) {
    pageCount++;
    // Fetch active, not closed, not archived markets with past endDates.
    // Every filter param must be re-sent on each page — the cursor is validated
    // against a hash of the originating query.
    const url =
      `https://gamma-api.polymarket.com/markets/keyset?limit=${PAGE_SIZE}` +
      `&active=true&closed=false&archived=false` +
      `&order=endDate&ascending=false` +
      `&end_date_min=${minEndDate.toISOString()}&end_date_max=${now.toISOString()}` +
      (cursor ? `&after_cursor=${encodeURIComponent(cursor)}` : '');

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

    const { markets, next_cursor }: KeysetPage = await response.json();

    if (!markets || markets.length === 0) {
      console.log(`[Relist] Page ${pageCount}: No more markets`);
      break;
    }

    // Surface the earliest endDate in the batch. Results are ordered endDate
    // descending, so this value should march backward each page — a visible
    // signal that the cursor is advancing rather than re-fetching page 1.
    const earliestEndDate = markets.reduce(
      (min, m) => (new Date(m.endDate) < new Date(min) ? m.endDate : min),
      markets[0].endDate
    );
    console.log(
      `[Relist] Page ${pageCount}: Fetched ${markets.length} markets (earliest endDate ${earliestEndDate})`
    );

    // Deduplicate and filter out archived markets (client-side safety net)
    for (const m of markets) {
      if (m.archived) continue;
      // Also filter client-side for endDate < now in case end_date_max isn't supported
      if (new Date(m.endDate) >= now) continue;
      if (!seenConditionIds.has(m.conditionId)) {
        seenConditionIds.add(m.conditionId);
        allMarkets.push(m);
      }
    }

    // Stop conditions:
    // 1. No next_cursor → server signalled the final page.
    // 2. Cursor already seen → API stopped advancing; stop instead of looping
    //    forever on the same page.
    if (!next_cursor || seenCursors.has(next_cursor)) {
      break;
    }
    seenCursors.add(next_cursor);
    cursor = next_cursor;
  }

  if (pageCount >= MAX_PAGES) {
    console.warn(
      `[Relist] Reached MAX_PAGES (${MAX_PAGES}); results may be truncated`
    );
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
