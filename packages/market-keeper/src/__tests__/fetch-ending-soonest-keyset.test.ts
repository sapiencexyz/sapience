import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

type FetchCall = { url: string; init?: RequestInit };
const fetchCalls: FetchCall[] = [];
const fetchQueue: Array<() => Response> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../utils/fetch', () => ({
  fetchWithRetry: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const next = fetchQueue.shift();
    if (!next) throw new Error(`No queued response for ${url}`);
    return next();
  }),
}));

import {
  fetchEndingSoonMarketsViaKeyset,
  fetchMarketsByEventTags,
} from '../generate/market';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

// endDate well inside the window so nothing is filtered by the boundary guard.
const IN_WINDOW = '2026-07-01T00:00:00.000Z';

function mkt(id: string, endDate: string = IN_WINDOW): PolymarketMarket {
  return {
    id,
    conditionId: `cond-${id}`,
    question: `Q ${id}`,
    outcomes: ['Yes', 'No'],
    volume: '0',
    liquidity: '0',
    endDate,
    description: '',
    slug: `slug-${id}`,
    active: true,
    closed: false,
  };
}

function keysetPage(markets: PolymarketMarket[], next_cursor?: string) {
  return jsonResponse({ markets, ...(next_cursor ? { next_cursor } : {}) });
}

const MIN = new Date('2026-06-27T15:00:00.000Z');
const MAX = new Date('2026-09-25T15:00:00.000Z');

describe('fetchEndingSoonMarketsViaKeyset', () => {
  it('hits /markets/keyset and never sends an offset param', async () => {
    fetchQueue.push(() => keysetPage([mkt('a')]));

    await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain(
      'https://gamma-api.polymarket.com/markets/keyset'
    );
    for (const call of fetchCalls) {
      expect(call.url).not.toContain('offset=');
    }
  });

  it('bounds the window with end_date_min and end_date_max', async () => {
    fetchQueue.push(() => keysetPage([mkt('a')]));

    await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    const url = fetchCalls[0].url;
    expect(url).toContain(
      `end_date_min=${encodeURIComponent(MIN.toISOString())}`
    );
    expect(url).toContain(
      `end_date_max=${encodeURIComponent(MAX.toISOString())}`
    );
    expect(url).toContain('active=true');
    expect(url).toContain('closed=false');
  });

  it('orders ending-soonest (order=endDate&ascending=true) so the cursor walks the window front-to-back', async () => {
    fetchQueue.push(() => keysetPage([mkt('a')]));

    await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    const url = fetchCalls[0].url;
    expect(url).toContain('order=endDate');
    expect(url).toContain('ascending=true');
  });

  it('follows next_cursor across pages and passes it as after_cursor', async () => {
    fetchQueue.push(() => keysetPage([mkt('a')], 'cursor-1'));
    fetchQueue.push(() => keysetPage([mkt('b')], 'cursor-2'));
    fetchQueue.push(() => keysetPage([mkt('c')])); // last page: no next_cursor

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls[0].url).not.toContain('after_cursor');
    expect(fetchCalls[1].url).toContain('after_cursor=cursor-1');
    expect(fetchCalls[2].url).toContain('after_cursor=cursor-2');
    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('paginates a large same-endDate cluster via cursor (regression: HTTP 422 offset cap)', async () => {
    // Reproduces the crash: hundreds of markets sharing one endDate. The old
    // offset fallback drove offset past Gamma's cap → 422. Keyset must walk the
    // whole cluster purely by cursor.
    const sameEnd = '2026-07-06T10:00:00.000Z';
    const pages = 5;
    for (let p = 0; p < pages; p++) {
      const batch = Array.from({ length: 100 }, (_, i) =>
        mkt(`p${p}-i${i}`, sameEnd)
      );
      const isLast = p === pages - 1;
      fetchQueue.push(() => keysetPage(batch, isLast ? undefined : `c${p}`));
    }

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(fetchCalls).toHaveLength(pages);
    expect(result).toHaveLength(pages * 100);
    for (const call of fetchCalls) {
      expect(call.url).not.toContain('offset=');
    }
  });

  it('deduplicates markets by conditionId across pages', async () => {
    fetchQueue.push(() => keysetPage([mkt('a'), mkt('b')], 'c1'));
    fetchQueue.push(() => keysetPage([mkt('b'), mkt('c')])); // b repeats

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops markets at or beyond maxEndDate (boundary guard)', async () => {
    const atMax = MAX.toISOString();
    const beyond = '2026-12-01T00:00:00.000Z';
    fetchQueue.push(() =>
      keysetPage([mkt('in', IN_WINDOW), mkt('edge', atMax), mkt('out', beyond)])
    );

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(result.map((m) => m.id)).toEqual(['in']);
  });

  it('stops on an unchanged cursor (guards the keyset cursor-ignored bug)', async () => {
    const batch = [mkt('a'), mkt('b')];
    // Server keeps handing back the same non-null cursor it was given (the
    // reported keyset cursor-ignored bug). Must not loop forever.
    fetchQueue.push(() => keysetPage(batch, 'stuck'));
    fetchQueue.push(() => keysetPage(batch, 'stuck'));
    fetchQueue.push(() => keysetPage(batch, 'stuck'));

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(fetchCalls.length).toBeLessThanOrEqual(2);
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('does NOT stop on a zero-new page while the cursor is still advancing', async () => {
    // A page can add zero markets because everything was filtered/deduped, not
    // because the cursor is stuck. As long as the cursor advances we must keep
    // walking, or we truncate the window early.
    const beyond = '2026-12-01T00:00:00.000Z'; // filtered out by the window guard
    fetchQueue.push(() => keysetPage([mkt('out', beyond)], 'cursor-1')); // 0 new, cursor advances
    fetchQueue.push(() => keysetPage([mkt('a')])); // real market on the next page

    const result = await fetchEndingSoonMarketsViaKeyset(MIN, MAX);

    expect(fetchCalls).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('throws and surfaces the status on a non-ok response', async () => {
    fetchQueue.push(() =>
      jsonResponse({ type: 'validation error', error: 'boom' }, 422)
    );

    await expect(fetchEndingSoonMarketsViaKeyset(MIN, MAX)).rejects.toThrow(
      /422/
    );
  });
});

function eventWith(slug: string, markets: PolymarketMarket[]) {
  return {
    id: `ev-${slug}`,
    title: `T ${slug}`,
    slug,
    description: '',
    markets,
  };
}

function eventsKeysetPage(
  events: ReturnType<typeof eventWith>[],
  next_cursor?: string
) {
  return jsonResponse({ events, ...(next_cursor ? { next_cursor } : {}) });
}

describe('fetchMarketsByEventTags', () => {
  it('hits /events/keyset, never sends offset, and bounds with end_date_max', async () => {
    fetchQueue.push(() => eventsKeysetPage([eventWith('e1', [mkt('a')])]));

    await fetchMarketsByEventTags(['earnings'], MAX);

    expect(fetchCalls).toHaveLength(1);
    const url = fetchCalls[0].url;
    expect(url).toContain('https://gamma-api.polymarket.com/events/keyset');
    expect(url).toContain('tag_slug=earnings');
    expect(url).toContain(
      `end_date_max=${encodeURIComponent(MAX.toISOString())}`
    );
    expect(url).not.toContain('offset=');
  });

  it('flattens event.markets and injects the parent event for grouping', async () => {
    fetchQueue.push(() =>
      eventsKeysetPage([eventWith('e1', [mkt('a'), mkt('b')])])
    );

    const result = await fetchMarketsByEventTags(['earnings'], MAX);

    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    expect(result[0].events?.[0]).toMatchObject({ slug: 'e1', id: 'ev-e1' });
  });

  it('follows next_cursor across event pages per tag', async () => {
    fetchQueue.push(() =>
      eventsKeysetPage([eventWith('e1', [mkt('a')])], 'ec1')
    );
    fetchQueue.push(() => eventsKeysetPage([eventWith('e2', [mkt('b')])]));

    const result = await fetchMarketsByEventTags(['earnings'], MAX);

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).not.toContain('after_cursor');
    expect(fetchCalls[1].url).toContain('after_cursor=ec1');
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('drops markets at or beyond maxEndDate', async () => {
    const beyond = '2026-12-01T00:00:00.000Z';
    fetchQueue.push(() =>
      eventsKeysetPage([
        eventWith('e1', [mkt('in', IN_WINDOW), mkt('out', beyond)]),
      ])
    );

    const result = await fetchMarketsByEventTags(['earnings'], MAX);

    expect(result.map((m) => m.id)).toEqual(['in']);
  });

  it('skips a tag on a non-ok response and continues to the next tag', async () => {
    fetchQueue.push(() => jsonResponse({ error: 'nope' }, 500)); // tag "a" fails
    fetchQueue.push(() => eventsKeysetPage([eventWith('e1', [mkt('z')])])); // tag "b" ok

    const result = await fetchMarketsByEventTags(['a', 'b'], MAX);

    expect(fetchCalls).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['z']);
  });

  it('stops on an unchanged cursor (guards the keyset cursor-ignored bug)', async () => {
    const page = [eventWith('e1', [mkt('a')])];
    fetchQueue.push(() => eventsKeysetPage(page, 'stuck'));
    fetchQueue.push(() => eventsKeysetPage(page, 'stuck'));
    fetchQueue.push(() => eventsKeysetPage(page, 'stuck'));

    const result = await fetchMarketsByEventTags(['earnings'], MAX);

    // Terminates after at most 2 requests instead of looping forever. This
    // fetcher does not dedup (the caller does), so the repeated page may yield a
    // duplicate — that's expected and harmless downstream.
    expect(fetchCalls.length).toBeLessThanOrEqual(2);
    expect(result.every((m) => m.id === 'a')).toBe(true);
  });
});
