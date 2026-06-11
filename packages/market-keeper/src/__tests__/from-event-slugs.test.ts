import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

// Keep LLM/constants test-safe; from-event-slugs pulls these transitively via
// pipeline → filters and refresh-metadata/fetch → tags.
vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CHAIN_ID: 5064014,
    LLM_ENRICHMENT_ENABLED: false,
    LLM_ENDTIME_SEARCH_ENABLED: false,
    OPENROUTER_API_KEY: '',
    LLM_MODEL: '',
    LLM_ENDTIME_MODEL: '',
    DEFAULT_SAPIENCE_API_URL: 'https://test-api.example.com',
  };
});

// Mock fetchWithRetry at the source — both from-event-slugs (/events) and
// refresh-metadata/fetch (/markets) read it from utils. A recorded call array
// plus a queue of canned responses lets each test wire exactly the traffic it
// cares about.
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
  isTradeableMarket,
  fetchConditionIdsForSlugs,
  fetchMarketsForEventSlugs,
} from '../generate/from-event-slugs';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test',
    question: 'Q?',
    conditionId: '0x123',
    outcomes: ['Yes', 'No'],
    volume: '1000',
    liquidity: '1000',
    endDate: '2030-01-01T00:00:00Z',
    description: 'desc',
    slug: 'm',
    active: true,
    closed: false,
    ...overrides,
  };
}

function eventResponse(slug: string, conditionIds: string[]): Response {
  return jsonResponse([
    {
      id: `evt-${slug}`,
      title: `Event ${slug}`,
      slug,
      description: 'event desc',
      markets: conditionIds.map((conditionId) => ({ conditionId })),
    },
  ]);
}

describe('isTradeableMarket', () => {
  it('keeps active, open, non-archived markets', () => {
    expect(isTradeableMarket(makeMarket())).toBe(true);
    expect(isTradeableMarket(makeMarket({ archived: undefined }))).toBe(true);
  });

  it('drops closed, archived, or inactive markets (matches generate gate)', () => {
    expect(isTradeableMarket(makeMarket({ closed: true }))).toBe(false);
    expect(isTradeableMarket(makeMarket({ archived: true }))).toBe(false);
    expect(isTradeableMarket(makeMarket({ active: false }))).toBe(false);
  });
});

describe('fetchConditionIdsForSlugs', () => {
  it('collects market conditionIds across slugs and dedups overlap', async () => {
    fetchQueue.push(() => eventResponse('a', ['0x1', '0x2']));
    fetchQueue.push(() => eventResponse('b', ['0x2', '0x3']));

    const ids = await fetchConditionIdsForSlugs(['a', 'b']);

    expect([...ids].sort()).toEqual(['0x1', '0x2', '0x3']);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain(
      'gamma-api.polymarket.com/events?slug=a'
    );
  });

  it('skips a slug that errors and continues with the rest', async () => {
    fetchQueue.push(
      () => new Response('nope', { status: 500, statusText: 'err' })
    );
    fetchQueue.push(() => eventResponse('b', ['0x9']));

    const ids = await fetchConditionIdsForSlugs(['a', 'b']);

    expect([...ids]).toEqual(['0x9']);
  });

  it('handles a slug with no matching event', async () => {
    fetchQueue.push(() => jsonResponse([]));
    const ids = await fetchConditionIdsForSlugs(['missing']);
    expect([...ids]).toEqual([]);
  });
});

describe('fetchMarketsForEventSlugs', () => {
  it('re-fetches via /markets, drops closed + non-binary, preserves negRisk', async () => {
    // /events resolves the slug to three conditionIds.
    fetchQueue.push(() => eventResponse('nba', ['0x1', '0x2', '0x3']));
    // /markets closed=false side: an active binary negRisk leg + an active
    // NON-binary market.
    fetchQueue.push(() =>
      jsonResponse([
        makeMarket({
          conditionId: '0x1',
          outcomes: ['Yes', 'No'],
          negRisk: true,
          negRiskMarketID: '0xBASKET',
        }),
        makeMarket({ conditionId: '0x2', outcomes: ['A', 'B', 'C'] }),
      ])
    );
    // /markets closed=true side: a resolved (closed) leg.
    fetchQueue.push(() =>
      jsonResponse([makeMarket({ conditionId: '0x3', closed: true })])
    );

    const markets = await fetchMarketsForEventSlugs(['nba']);

    // 0x2 dropped by the binary filter, 0x3 dropped by the active/open gate.
    expect(markets.map((m) => m.conditionId)).toEqual(['0x1']);
    // negRisk fields survive the round-trip so groupMarkets stamps the basket.
    expect(markets[0].negRisk).toBe(true);
    expect(markets[0].negRiskMarketID).toBe('0xBASKET');
  });

  it('returns [] without fetching markets when no event resolves', async () => {
    fetchQueue.push(() => jsonResponse([]));
    const markets = await fetchMarketsForEventSlugs(['missing']);
    expect(markets).toEqual([]);
    // only the /events call happened, no /markets round-trip
    expect(fetchCalls).toHaveLength(1);
  });
});
