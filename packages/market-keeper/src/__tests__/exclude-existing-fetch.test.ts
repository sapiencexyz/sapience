import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { checkExistingConditions } from '../generate/pipeline/filters/exclude-existing';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

function conditionsPage(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  }
): Response {
  return jsonResponse({ data: { conditions: { nodes, pageInfo } } });
}

function makeNode(
  conditionId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    conditionId,
    endTime: 1700000000,
    question: 'Q',
    shortName: null,
    optionName: null,
    description: '',
    tags: [],
    similarMarket: null,
    conditionGroup: null,
    ...overrides,
  };
}

describe('checkExistingConditions', () => {
  it('returns an empty Map immediately for an empty input list', async () => {
    const result = await checkExistingConditions('https://api.example.com', []);
    expect(result.size).toBe(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('queries public and hidden rows separately (omitting public defaults to public-only)', async () => {
    // Both public and private rows count as pre-existing so the pipeline
    // never tries to recreate them — the listing default of public-only
    // would silently drop hidden rows.
    fetchQueue.push(() => conditionsPage([makeNode('0x1')]));
    fetchQueue.push(() => conditionsPage([makeNode('0x2')]));

    const result = await checkExistingConditions('https://api.example.com', [
      '0x1',
      '0x2',
    ]);

    expect(fetchCalls).toHaveLength(2);
    for (const call of fetchCalls) {
      expect(call.url).toBe('https://api.example.com/v2/graphql');
    }
    const filters = fetchCalls.map(
      (c) => JSON.parse(c.init!.body as string).variables.filter
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        { conditionIds: ['0x1', '0x2'], public: true },
        { conditionIds: ['0x1', '0x2'], public: false },
      ])
    );
    expect([...result.keys()].sort()).toEqual(['0x1', '0x2']);
  });

  it('chunks large id lists into batches of 100 per side', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `0x${i + 1}`);
    // 2 chunks × 2 sides = 4 requests.
    for (let i = 0; i < 4; i++) fetchQueue.push(() => conditionsPage([]));

    await checkExistingConditions('https://api.example.com', ids);

    expect(fetchCalls).toHaveLength(4);
    const sizes = fetchCalls.map(
      (c) =>
        JSON.parse(c.init!.body as string).variables.filter.conditionIds.length
    );
    expect(sizes.sort((a, b) => a - b)).toEqual([50, 50, 100, 100]);
  });

  it('maps GraphQL fields onto the ExistingCondition shape', async () => {
    fetchQueue.push(() =>
      conditionsPage([
        makeNode('0xabc', {
          question: 'Will X happen?',
          shortName: 'X?',
          optionName: 'Yes side',
          description: 'A description',
          tags: ['crypto'],
          similarMarket: {
            markets: ['https://polymarket.com/event/foo#bar'],
            image: 'https://img.example/x.png',
            volume: 42,
          },
          conditionGroup: {
            groupId: 7,
            name: 'Group Name',
            similarMarkets: ['https://polymarket.com/event/foo#bar'],
            negRisk: true,
          },
        }),
      ])
    );
    fetchQueue.push(() => conditionsPage([]));

    const result = await checkExistingConditions('https://api.example.com', [
      '0xabc',
    ]);

    expect(result.get('0xabc')).toEqual({
      endTime: 1700000000,
      question: 'Will X happen?',
      shortName: 'X?',
      optionName: 'Yes side',
      description: 'A description',
      similarMarkets: ['https://polymarket.com/event/foo#bar'],
      tags: ['crypto'],
      similarMarketVolume: 42,
      similarMarketImage: 'https://img.example/x.png',
      groupName: 'Group Name',
      conditionGroupId: 7,
      conditionGroupSimilarMarkets: ['https://polymarket.com/event/foo#bar'],
      conditionGroupNegRisk: true,
    });
  });

  it('continues with remaining chunks when one chunk errors, keeping partial results', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `0x${i + 1}`);
    // Chunk 1: public side errors → whole chunk skipped (warn, continue).
    fetchQueue.push(
      () => new Response('boom', { status: 500, statusText: 'Server Error' })
    );
    // Chunk 2: both sides succeed.
    fetchQueue.push(() => conditionsPage([makeNode('0x101')]));
    fetchQueue.push(() => conditionsPage([]));

    const result = await checkExistingConditions(
      'https://api.example.com',
      ids
    );

    expect(result.has('0x101')).toBe(true);
  });
});
