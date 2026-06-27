/**
 * Market fetching and filtering utilities
 */

import type { PolymarketMarket } from '../types';
import { MAX_END_DATE_DAYS, SUPPLEMENTARY_EVENT_TAGS } from '../constants';
import { fetchWithRetry } from '../utils';
import { runPipeline, printPipelineStats, MARKET_FILTERS } from './pipeline';

/**
 * Page through Gamma's /markets/keyset endpoint for markets ending within the
 * [minEndDate, maxEndDate) window, deduplicated by conditionId.
 *
 * Uses cursor-based pagination (after_cursor / next_cursor). Polymarket
 * deprecated offset pagination on the legacy /markets endpoint (sunset
 * 2026-05-01) and now returns HTTP 422 — "offset too large, use /markets/keyset
 * for deeper pagination" — once the offset grows large. Discovery hit this
 * whenever a large cluster of markets shared a single endDate: the old fetcher's
 * offset fallback walked deep enough to trip the cap and the keeper crashed.
 * Keyset has no offset cap, so it walks same-endDate clusters of any size
 * without truncating.
 *
 * Both ends of the window are bounded server-side via end_date_min/end_date_max
 * so the cursor walk terminates at the window edge instead of paging the entire
 * active-market set.
 */
export async function fetchEndingSoonMarketsViaKeyset(
  minEndDate: Date,
  maxEndDate: Date
): Promise<PolymarketMarket[]> {
  const allMarkets: PolymarketMarket[] = [];
  const seenConditionIds = new Set<string>(); // deduplicate across pages
  const PAGE_SIZE = 100; // keyset max page size (since 2026-05-14)
  // Hard backstop against a pathological non-terminating walk. The window is
  // bounded to MAX_END_DATE_DAYS so the real page count is small; this only
  // ever trips if the server keeps issuing fresh cursors without converging.
  const MAX_PAGES = 5000;

  // Order ending-soonest so the cursor walks the window front-to-back. `order`
  // must be set for `ascending` to take effect (Gamma ignores `ascending`
  // otherwise). Both ends of the window are bounded server-side so the walk
  // terminates at the window edge instead of paging the entire active set.
  const baseParams =
    `limit=${PAGE_SIZE}` +
    `&active=true&closed=false` +
    `&order=endDate&ascending=true` +
    `&end_date_min=${encodeURIComponent(minEndDate.toISOString())}` +
    `&end_date_max=${encodeURIComponent(maxEndDate.toISOString())}`;

  let cursor: string | undefined;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const url =
      `https://gamma-api.polymarket.com/markets/keyset?${baseParams}` +
      (cursor ? `&after_cursor=${encodeURIComponent(cursor)}` : '');

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

    const body: { markets?: PolymarketMarket[]; next_cursor?: string } =
      await response.json();
    const markets = body.markets ?? [];

    let newMarketsCount = 0;
    for (const m of markets) {
      // end_date_max bounds the window server-side; this guards against any
      // boundary markets (endDate === maxEndDate) slipping through.
      if (new Date(m.endDate) >= maxEndDate) continue;
      if (seenConditionIds.has(m.conditionId)) continue;
      seenConditionIds.add(m.conditionId);
      allMarkets.push(m);
      newMarketsCount++;
    }

    console.log(
      `[Polymarket] Page ${pageCount}: fetched ${markets.length} markets (+${newMarketsCount} new, ${allMarkets.length} total)`
    );

    // Normal termination: the server omits next_cursor on the final page.
    if (!body.next_cursor) break;

    // Safety net for the reported keyset bug where the server ignores the
    // cursor and re-serves the same page with an unchanged next_cursor. Detect
    // the stuck cursor directly (next_cursor === the cursor we just sent) rather
    // than inferring it from a zero-new-market page — a page can legitimately
    // add zero markets because every row was deduped or filtered out by the
    // window guard, and stopping on that would truncate the walk early.
    if (body.next_cursor === cursor) {
      console.warn(
        `[Polymarket] Page ${pageCount} returned an unchanged cursor — stopping to avoid a pagination loop`
      );
      break;
    }

    if (pageCount >= MAX_PAGES) {
      console.error(
        `[Polymarket] Reached ${MAX_PAGES}-page cap without exhausting the cursor — stopping (results may be incomplete)`
      );
      break;
    }

    cursor = body.next_cursor;
  }

  console.log(
    `[Polymarket] Total fetched: ${allMarkets.length} markets across ${pageCount} pages`
  );

  return allMarkets;
}

/**
 * Fetch markets that end soonest (for --ending-soon mode), within the
 * MAX_END_DATE_DAYS window, then augment with supplementary event-tag markets
 * and run the raw-market filter pipeline.
 */
export async function fetchEndingSoonestMarkets(): Promise<PolymarketMarket[]> {
  // Minimum end time: current time + 1 minute
  const minEndDate = new Date(Date.now() + 60 * 1000);
  // Maximum end time: current time + MAX_END_DATE_DAYS
  const maxEndDate = new Date(
    Date.now() + MAX_END_DATE_DAYS * 24 * 60 * 60 * 1000
  );

  console.log(
    `[Polymarket] Fetching ending-soon markets until ${maxEndDate.toISOString()}...`
  );

  const allMarkets = await fetchEndingSoonMarketsViaKeyset(
    minEndDate,
    maxEndDate
  );
  const seenConditionIds = new Set(allMarkets.map((m) => m.conditionId));

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
 * Fetch markets from the /events/keyset endpoint by tag slugs.
 * Returns flattened market objects from event.markets[].
 * Injects the parent event into each market's `events` array so downstream
 * grouping logic (which reads market.events[0]) works correctly.
 *
 * Uses cursor-based keyset pagination for the same reason as the markets walk:
 * the legacy /events endpoint is on the same deprecation track (sunset
 * 2026-05-01) and offset pagination is rejected. end_date_max bounds the window
 * server-side; the per-tag walk follows next_cursor to exhaustion.
 */
export async function fetchMarketsByEventTags(
  tagSlugs: string[],
  maxEndDate: Date
): Promise<PolymarketMarket[]> {
  const markets: PolymarketMarket[] = [];
  const PAGE_SIZE = 100; // keyset max page size
  const MAX_PAGES = 5000; // non-termination backstop (see markets walk)

  const baseParams =
    `limit=${PAGE_SIZE}` +
    `&active=true&closed=false` +
    `&end_date_max=${encodeURIComponent(maxEndDate.toISOString())}`;

  for (const tag of tagSlugs) {
    let cursor: string | undefined;
    let pageCount = 0;
    let tagMarketCount = 0;

    while (true) {
      pageCount++;
      const url =
        `https://gamma-api.polymarket.com/events/keyset?${baseParams}` +
        `&tag_slug=${encodeURIComponent(tag)}` +
        (cursor ? `&after_cursor=${encodeURIComponent(cursor)}` : '');

      const response = await fetchWithRetry(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.warn(
          `[Polymarket] Failed to fetch events for tag "${tag}": HTTP ${response.status}`
        );
        break; // give up on this tag, move on to the next
      }

      const body: {
        events?: Array<{
          id?: string;
          title?: string;
          slug?: string;
          description?: string;
          markets?: PolymarketMarket[];
        }>;
        next_cursor?: string;
      } = await response.json();
      const events = body.events ?? [];

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
            tagMarketCount++;
          }
        }
      }

      // Normal end (no next_cursor), stuck-cursor guard, and hard backstop —
      // mirroring the markets/keyset walk.
      if (!body.next_cursor || body.next_cursor === cursor) break;
      if (pageCount >= MAX_PAGES) {
        console.error(
          `[Polymarket] Tag "${tag}": reached ${MAX_PAGES}-page cap — stopping (results may be incomplete)`
        );
        break;
      }
      cursor = body.next_cursor;
    }

    console.log(
      `[Polymarket] Tag "${tag}": fetched ${tagMarketCount} markets in window across ${pageCount} page(s)`
    );
  }

  return markets;
}
