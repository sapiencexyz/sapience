import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

// Lock LLM and constants to test-safe values; refresh-metadata pulls these
// transitively via grouping.ts → llm imports.
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

// Mock fetchWithRetry at the source — both fetch.ts (refresh-metadata) and
// tags.ts (event tag fetch) read it from utils. A single recorded array of
// (url, init) calls plus a queue of canned responses lets each test wire
// exactly the GraphQL + Gamma traffic it cares about.
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
  fetchAllExistingConditions,
  fetchMarketsByConditionIds,
  fetchEventTagsByIds,
} from '../refresh-metadata/fetch';

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
    question: 'Q',
    conditionId: '0x123',
    outcomes: ['Yes', 'No'],
    volume: '0',
    liquidity: '0',
    endDate: '2030-01-01T00:00:00Z',
    description: '',
    slug: 'btc-100k',
    active: true,
    closed: false,
    events: [{ title: 'Bitcoin Milestones', slug: 'btc-milestones' }],
    ...overrides,
  };
}

describe('fetchAllExistingConditions', () => {
  it('sends a where clause that filters to public + unsettled + non-empty similarMarkets', async () => {
    fetchQueue.push(() => jsonResponse({ data: { conditions: [] } }));

    await fetchAllExistingConditions('https://api.example.com');

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init!.body as string);
    expect(body.variables.where).toEqual({
      public: { equals: true },
      settled: { equals: false },
      similarMarkets: { isEmpty: false },
    });
    expect(body.variables.orderBy).toEqual([{ id: 'asc' }]);
    expect(fetchCalls[0].url.endsWith('/graphql')).toBe(true);
  });

  it('paginates with deterministic orderBy until a page returns < pageSize', async () => {
    // Two full pages of 100 then an empty short page — same shape
    // refresh-volume's fetchActiveConditionIds uses.
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `0x${(i + 1).toString().padStart(3, '0')}`,
      endTime: 1700000000,
      similarMarkets: ['https://polymarket.com/event/x#y'],
    }));
    const page2 = Array.from({ length: 100 }, (_, i) => ({
      id: `0x${(i + 101).toString().padStart(3, '0')}`,
      endTime: 1700000000,
      similarMarkets: ['https://polymarket.com/event/x#y'],
    }));
    const page3 = [
      {
        id: '0x999',
        endTime: 1700000000,
        similarMarkets: ['https://polymarket.com/event/x#y'],
      },
    ];

    fetchQueue.push(() => jsonResponse({ data: { conditions: page1 } }));
    fetchQueue.push(() => jsonResponse({ data: { conditions: page2 } }));
    fetchQueue.push(() => jsonResponse({ data: { conditions: page3 } }));

    const result = await fetchAllExistingConditions('https://api.example.com');

    expect(result.size).toBe(201);
    expect(fetchCalls).toHaveLength(3);
    expect(JSON.parse(fetchCalls[0].init!.body as string).variables.skip).toBe(
      0
    );
    expect(JSON.parse(fetchCalls[1].init!.body as string).variables.skip).toBe(
      100
    );
    expect(JSON.parse(fetchCalls[2].init!.body as string).variables.skip).toBe(
      200
    );
  });

  it('maps GraphQL fields onto the ExistingCondition shape', async () => {
    fetchQueue.push(() =>
      jsonResponse({
        data: {
          conditions: [
            {
              id: '0xabc',
              endTime: 1700000000,
              question: 'Will X happen?',
              shortName: 'X?',
              optionName: 'Yes side',
              description: 'A description',
              similarMarkets: ['https://polymarket.com/event/foo#bar'],
              tags: ['crypto', 'btc'],
              similarMarketVolume: 1234,
              similarMarketImage: 'https://img.example/x.png',
              conditionGroup: {
                id: 7,
                name: 'Group Name',
                similarMarkets: ['https://polymarket.com/event/foo#bar'],
              },
            },
          ],
        },
      })
    );

    const result = await fetchAllExistingConditions('https://api.example.com');
    const row = result.get('0xabc');

    expect(row).toEqual({
      endTime: 1700000000,
      question: 'Will X happen?',
      shortName: 'X?',
      optionName: 'Yes side',
      description: 'A description',
      similarMarkets: ['https://polymarket.com/event/foo#bar'],
      tags: ['crypto', 'btc'],
      similarMarketVolume: 1234,
      similarMarketImage: 'https://img.example/x.png',
      groupName: 'Group Name',
      conditionGroupId: 7,
      conditionGroupSimilarMarkets: ['https://polymarket.com/event/foo#bar'],
    });
  });

  it('throws when the GraphQL endpoint returns a non-2xx', async () => {
    fetchQueue.push(
      () =>
        new Response('boom', {
          status: 500,
          statusText: 'Internal Server Error',
        })
    );

    await expect(
      fetchAllExistingConditions('https://api.example.com')
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('fetchMarketsByConditionIds', () => {
  it('returns an empty Map immediately for an empty input list', async () => {
    const result = await fetchMarketsByConditionIds([]);
    expect(result.size).toBe(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('builds Gamma URLs with repeated condition_ids params', async () => {
    fetchQueue.push(() =>
      jsonResponse([
        makeMarket({ conditionId: '0x1' }),
        makeMarket({ conditionId: '0x2' }),
      ])
    );

    await fetchMarketsByConditionIds(['0x1', '0x2']);

    expect(fetchCalls).toHaveLength(1);
    const url = fetchCalls[0].url;
    expect(url).toMatch(/^https:\/\/gamma-api\.polymarket\.com\/markets\?/);
    expect(url).toContain('condition_ids=0x1');
    expect(url).toContain('condition_ids=0x2');
    // Plural-param style (not condition_id=, not a CSV)
    expect(url).not.toContain('condition_id=');
    expect(url).not.toContain('0x1%2C0x2');
  });

  it('batches input into Gamma calls of at most 50 IDs', async () => {
    const ids = Array.from({ length: 75 }, (_, i) => `0x${i + 1}`);
    fetchQueue.push(() => jsonResponse([])); // batch 1: 50 IDs
    fetchQueue.push(() => jsonResponse([])); // batch 2: 25 IDs

    await fetchMarketsByConditionIds(ids);

    expect(fetchCalls).toHaveLength(2);
    const batch1Count = (fetchCalls[0].url.match(/condition_ids=/g) || [])
      .length;
    const batch2Count = (fetchCalls[1].url.match(/condition_ids=/g) || [])
      .length;
    expect(batch1Count).toBe(50);
    expect(batch2Count).toBe(25);
  });

  it('keys the returned Map by conditionId regardless of response order', async () => {
    fetchQueue.push(() =>
      jsonResponse([
        makeMarket({ conditionId: '0xb' }),
        makeMarket({ conditionId: '0xa' }),
      ])
    );

    const result = await fetchMarketsByConditionIds(['0xa', '0xb']);
    expect([...result.keys()].sort()).toEqual(['0xa', '0xb']);
  });

  it('skips missing conditionIds (delisted) without including them in the result', async () => {
    // Caller asks for 3 IDs; Gamma only returns 2.
    fetchQueue.push(() =>
      jsonResponse([
        makeMarket({ conditionId: '0xa' }),
        makeMarket({ conditionId: '0xc' }),
      ])
    );

    const result = await fetchMarketsByConditionIds(['0xa', '0xb', '0xc']);
    expect(result.has('0xa')).toBe(true);
    expect(result.has('0xb')).toBe(false);
    expect(result.has('0xc')).toBe(true);
  });

  it('continues batching even if one batch errors', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `0x${i + 1}`);
    fetchQueue.push(
      () => new Response('oops', { status: 502, statusText: 'Bad Gateway' })
    );
    fetchQueue.push(() => jsonResponse([makeMarket({ conditionId: '0x55' })]));

    const result = await fetchMarketsByConditionIds(ids);
    expect(result.has('0x55')).toBe(true);
  });
});

describe('fetchEventTagsByIds', () => {
  it('returns an empty Map immediately for an empty / all-falsy input', async () => {
    expect((await fetchEventTagsByIds([])).size).toBe(0);
    expect(
      (await fetchEventTagsByIds(['', undefined as unknown as string])).size
    ).toBe(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('batches up to 50 unique IDs per /events request with repeated id= params and limit=50', async () => {
    fetchQueue.push(() =>
      jsonResponse([
        { id: '1', slug: 'a', tags: [{ label: 'Politics' }] },
        { id: '2', slug: 'b', tags: [{ label: 'Sports' }] },
      ])
    );

    const result = await fetchEventTagsByIds(['1', '2', '1']); // '1' duplicated

    expect(fetchCalls).toHaveLength(1);
    const url = fetchCalls[0].url;
    expect(url).toMatch(/^https:\/\/gamma-api\.polymarket\.com\/events\?/);
    expect(url).toContain('limit=50');
    expect(url).toContain('id=1');
    expect(url).toContain('id=2');
    // Plural-param style — not CSV, not single-id
    expect(url).not.toContain('ids=');
    expect(url).not.toContain('1%2C2');
    expect(result.get('a')).toEqual(['Politics']);
    expect(result.get('b')).toEqual(['Sports']);
  });

  it('keys the result Map by event slug (not by ID)', async () => {
    fetchQueue.push(() =>
      jsonResponse([
        { id: '42', slug: 'my-event', tags: [{ label: 'Crypto' }] },
      ])
    );

    const result = await fetchEventTagsByIds(['42']);
    expect(result.has('42')).toBe(false);
    expect(result.get('my-event')).toEqual(['Crypto']);
  });

  it('drops the generic "All" tag and dedupes labels', async () => {
    fetchQueue.push(() =>
      jsonResponse([
        {
          id: '1',
          slug: 'foo',
          tags: [
            { label: 'All' },
            { label: 'Politics' },
            { label: 'Politics' }, // duplicate
            { label: 'US' },
          ],
        },
      ])
    );

    const result = await fetchEventTagsByIds(['1']);
    expect(result.get('foo')).toEqual(['Politics', 'US']);
  });

  it('skips a batch whose response is non-2xx without aborting the rest', async () => {
    // 75 IDs = two batches (50 + 25). First fails, second succeeds.
    const ids = Array.from({ length: 75 }, (_, i) => `${i}`);
    fetchQueue.push(
      () => new Response('nope', { status: 502, statusText: 'Bad Gateway' })
    );
    fetchQueue.push(() =>
      jsonResponse([{ id: '70', slug: 'good', tags: [{ label: 'Crypto' }] }])
    );

    const result = await fetchEventTagsByIds(ids);
    expect(fetchCalls).toHaveLength(2);
    expect(result.get('good')).toEqual(['Crypto']);
  });

  it('chunks 175 unique IDs into four batches (50 + 50 + 50 + 25)', async () => {
    const ids = Array.from({ length: 175 }, (_, i) => `${i}`);
    for (let i = 0; i < 4; i++) fetchQueue.push(() => jsonResponse([]));

    await fetchEventTagsByIds(ids);

    expect(fetchCalls).toHaveLength(4);
    const idCounts = fetchCalls.map(
      (c) => (c.url.match(/(?<=^|&)id=/g) || []).length
    );
    expect(idCounts).toEqual([50, 50, 50, 25]);
  });
});
