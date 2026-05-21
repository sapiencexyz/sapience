/**
 * Fetch helpers for refresh-metadata.
 *
 * Splits cleanly in two:
 *   - fetchAllExistingConditions: paginated GraphQL walk over Sapience for
 *     every public + unsettled condition that has at least one similarMarkets
 *     entry. Mirrors the projection of checkExistingConditions so the diff
 *     helpers it feeds (computeMetadataUpdates / computeGroupMetadataUpdates)
 *     work unchanged.
 *   - fetchMarketsByConditionIds: batched Polymarket Gamma /markets call by
 *     condition_ids (plural per-param), returns Map keyed by conditionId.
 */

import type { PolymarketMarket } from '../types';
import { fetchWithRetry } from '../utils';
import { normalizeTagLabel } from '../generate/tags';
import type { ExistingCondition } from '../generate/pipeline';

const SAPIENCE_PAGE_SIZE = 100;
const GAMMA_BATCH_SIZE = 25;
const GAMMA_CONCURRENCY = 10;
const EVENT_TAGS_BATCH_SIZE = 50;
const EVENT_TAGS_CONCURRENCY = 10;

// Polymarket's default `limit` is 20 (verified empirically) — passing limit
// is load-bearing, not optional. We size it well above each request's batch
// so the response is bounded by the `id=`/`condition_ids=` filter, not by
// the page cap. Headroom is intentional: even if the API ever returned more
// rows than expected per ID (related-events, soft match, etc.), we still
// wouldn't silently truncate.
const GAMMA_RESPONSE_LIMIT = GAMMA_BATCH_SIZE * 4;
const EVENT_TAGS_RESPONSE_LIMIT = EVENT_TAGS_BATCH_SIZE * 4;

/**
 * Paginate Sapience GraphQL conditions to collect every refreshable row.
 * Filters: public=true, settled=false, similarMarkets non-empty.
 * Pagination: orderBy id asc, take/skip — deterministic to avoid skipping
 * rows that share a timestamp (same approach as fetchActiveConditionIds in
 * refresh-volume).
 */
export async function fetchAllExistingConditions(
  apiUrl: string
): Promise<Map<string, ExistingCondition>> {
  const graphqlUrl = apiUrl.replace(/\/+$/, '') + '/graphql';

  // Uses the Relay-shaped `conditionsConnection` (the legacy bare
  // `conditions(where:)` resolver is deprecated per the redesign).
  // Cursor-paginated via `first` / `after`; reads `pageInfo.endCursor`
  // and `pageInfo.hasNextPage` to drive the loop.
  const query = `
    query RefreshMetadataConditions($filter: ConditionFilter!, $first: Int!, $after: String) {
      conditionsConnection(filter: $filter, first: $first, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
        nodes {
          id
          endTime
          question
          shortName
          optionName
          description
          similarMarkets
          tags
          similarMarketVolume
          similarMarketImage
          conditionGroup {
            id
            name
            similarMarkets
            negRisk
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const existing = new Map<string, ExistingCondition>();
  let after: string | null = null;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const pageStart = Date.now();
    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {
          filter: {
            visibility: 'PUBLIC',
            settled: false,
            hasSimilarMarkets: true,
          },
          first: SAPIENCE_PAGE_SIZE,
          after,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `[RefreshMetadata] GraphQL query failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const result = (await response.json()) as {
      data?: {
        conditionsConnection?: {
          nodes?: Array<{
            id: string;
            endTime: number;
            question?: string | null;
            shortName?: string | null;
            optionName?: string | null;
            description?: string | null;
            similarMarkets?: string[] | null;
            tags?: string[] | null;
            similarMarketVolume?: number | null;
            similarMarketImage?: string | null;
            conditionGroup?: {
              id?: number | null;
              name?: string | null;
              similarMarkets?: string[] | null;
              negRisk?: boolean | null;
            } | null;
          }>;
          pageInfo?: {
            hasNextPage?: boolean | null;
            endCursor?: string | null;
          } | null;
        };
      };
    };

    const conditions = result.data?.conditionsConnection?.nodes ?? [];
    const pageInfo = result.data?.conditionsConnection?.pageInfo;
    const hasMore = pageInfo?.hasNextPage ?? false;

    for (const c of conditions) {
      existing.set(c.id, {
        endTime: c.endTime,
        question: c.question ?? undefined,
        shortName: c.shortName ?? undefined,
        optionName: c.optionName ?? undefined,
        description: c.description ?? undefined,
        similarMarkets: c.similarMarkets ?? undefined,
        tags: c.tags ?? undefined,
        similarMarketVolume: c.similarMarketVolume ?? undefined,
        similarMarketImage: c.similarMarketImage ?? undefined,
        groupName: c.conditionGroup?.name ?? undefined,
        conditionGroupId: c.conditionGroup?.id ?? undefined,
        conditionGroupSimilarMarkets:
          c.conditionGroup?.similarMarkets ?? undefined,
        conditionGroupNegRisk: c.conditionGroup?.negRisk ?? undefined,
      });
    }

    console.log(
      `[RefreshMetadata]   GraphQL page ${pageCount}: fetched ${conditions.length} (cumulative ${existing.size}, ${Date.now() - pageStart}ms)`
    );

    if (!hasMore) break;
    after = pageInfo?.endCursor ?? null;
    if (!after) break;
  }

  return existing;
}

/**
 * Fetch Polymarket markets by condition_id, batched and parallelized.
 * Gamma accepts repeated `condition_ids=` query params; the response order
 * is not guaranteed so the result Map is keyed by conditionId. Missing IDs
 * (delisted markets) don't appear in the Map; callers skip those rather
 * than emitting clobbering updates.
 *
 * Batches of GAMMA_BATCH_SIZE IDs run in concurrent waves of GAMMA_CONCURRENCY.
 * Per-batch failures are logged and skipped; the rest of the wave completes.
 */
export async function fetchMarketsByConditionIds(
  conditionIds: string[]
): Promise<Map<string, PolymarketMarket>> {
  const out = new Map<string, PolymarketMarket>();
  if (conditionIds.length === 0) return out;

  const batches: string[][] = [];
  for (let i = 0; i < conditionIds.length; i += GAMMA_BATCH_SIZE) {
    batches.push(conditionIds.slice(i, i + GAMMA_BATCH_SIZE));
  }
  const totalBatches = batches.length;

  // Polymarket /markets defaults to `closed=false` — markets that have
  // resolved on Polymarket but are still `settled=false` on Sapience would
  // silently fall out of the result set. Query both states and merge.
  const fetchOneSide = async (
    batch: string[],
    closed: boolean
  ): Promise<PolymarketMarket[]> => {
    const params = batch
      .map((id) => `condition_ids=${encodeURIComponent(id)}`)
      .join('&');
    const url = `https://gamma-api.polymarket.com/markets?${params}&closed=${closed}&limit=${GAMMA_RESPONSE_LIMIT}`;
    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.warn(
        `[RefreshMetadata]   Gamma fetch (closed=${closed}) failed: HTTP ${response.status}`
      );
      return [];
    }
    return (await response.json()) as PolymarketMarket[];
  };

  const fetchBatch = async (
    batch: string[],
    batchIdx: number
  ): Promise<void> => {
    const batchStart = Date.now();
    const [open, closed] = await Promise.all([
      fetchOneSide(batch, false),
      fetchOneSide(batch, true),
    ]);
    const seen = new Set<string>();
    for (const m of [...open, ...closed]) {
      if (m.conditionId && !seen.has(m.conditionId)) {
        seen.add(m.conditionId);
        out.set(m.conditionId, m);
      }
    }
    const matched = open.length + closed.length;
    console.log(
      `[RefreshMetadata]   Gamma batch ${batchIdx}/${totalBatches}: ${matched}/${batch.length} markets (open ${open.length} + closed ${closed.length}, cumulative ${out.size}, ${Date.now() - batchStart}ms)`
    );
  };

  for (let i = 0; i < batches.length; i += GAMMA_CONCURRENCY) {
    const wave = batches.slice(i, i + GAMMA_CONCURRENCY);
    await Promise.allSettled(
      wave.map((batch, j) => fetchBatch(batch, i + j + 1))
    );
  }

  return out;
}

/**
 * Fetch event tags for a specific set of event IDs.
 *
 * The original `fetchEventTags` walks every event in a date window — fine for
 * the generate cron's 7-day cohort, but for refresh-metadata the date window
 * spans every public + unsettled condition (often a year+) and pulling all
 * ~50k events for a few thousand needed events is the dominant cost in the
 * pipeline.
 *
 * Polymarket's Gamma `/events` endpoint accepts repeated `id=` query params
 * (verified empirically — docs only mention single-slug lookup). With
 * `?limit=N&id=<a>&id=<b>...` we batch up to 50 IDs per request, then
 * parallelize in waves of EVENT_TAGS_CONCURRENCY. Failures inside a batch
 * are logged; the caller falls back to existing stored tags for any event
 * not in the result Map (same "don't clobber with worse data" stance the
 * rest of the script uses).
 *
 * Returns a map keyed by event SLUG (not ID), because the diff helpers look
 * up tags via `event.slug`.
 */
export async function fetchEventTagsByIds(
  eventIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(eventIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return out;

  const fetchBatch = async (
    batch: string[],
    batchIdx: number,
    totalBatches: number
  ): Promise<void> => {
    const params = batch.map((id) => `id=${encodeURIComponent(id)}`).join('&');
    const url = `https://gamma-api.polymarket.com/events?limit=${EVENT_TAGS_RESPONSE_LIMIT}&${params}`;
    const batchStart = Date.now();
    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      console.warn(
        `[RefreshMetadata]   Event tags batch ${batchIdx}/${totalBatches} failed: HTTP ${response.status}`
      );
      return;
    }
    const events = (await response.json()) as Array<{
      slug?: string;
      tags?: Array<{ label?: string; slug?: string }>;
    }>;
    let mapped = 0;
    for (const event of events) {
      if (!event.slug) continue;
      const labels = (event.tags ?? [])
        .map((t) => t.label)
        .filter((label): label is string => !!label && label !== 'All')
        .map(normalizeTagLabel);
      out.set(event.slug, [...new Set(labels)]);
      mapped++;
    }
    console.log(
      `[RefreshMetadata]   Event tags batch ${batchIdx}/${totalBatches}: ${mapped}/${batch.length} mapped (cumulative ${out.size}, ${Date.now() - batchStart}ms)`
    );
  };

  // Pre-compute all batches, then run them in concurrency-limited waves.
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += EVENT_TAGS_BATCH_SIZE) {
    batches.push(unique.slice(i, i + EVENT_TAGS_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += EVENT_TAGS_CONCURRENCY) {
    const wave = batches.slice(i, i + EVENT_TAGS_CONCURRENCY);
    await Promise.allSettled(
      wave.map((batch, j) => fetchBatch(batch, i + j + 1, batches.length))
    );
  }

  return out;
}
