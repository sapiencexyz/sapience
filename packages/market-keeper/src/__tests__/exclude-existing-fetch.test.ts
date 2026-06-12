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

  it('drops empty/invalid conditionIds before querying (one bad id must not poison the chunk)', async () => {
    // The v2 `conditionIds` filter is a strict Bytes scalar: a single ''/non-hex
    // element 500s the ENTIRE variable, skipping the whole 100-id chunk. So bad
    // ids must be filtered out before the query, leaving the valid ones intact.
    fetchQueue.push(() => conditionsPage([makeNode('0x1'), makeNode('0x2')]));

    await checkExistingConditions('https://api.example.com', [
      '0x1',
      '', // empty — Polymarket market with no conditionId
      '0x2',
      'not-hex', // malformed
    ]);

    expect(fetchCalls).toHaveLength(1);
    const filter = JSON.parse(fetchCalls[0].init!.body as string).variables
      .filter;
    expect(filter.conditionIds).toEqual(['0x1', '0x2']);
  });

  it('makes no request and returns empty when every id is invalid', async () => {
    const result = await checkExistingConditions('https://api.example.com', [
      '',
      '   ',
      'nope',
    ]);

    expect(fetchCalls).toHaveLength(0);
    expect(result.size).toBe(0);
  });

  it('matches public and hidden rows in one id-filtered query (no public filter)', async () => {
    // Both public and private rows count as pre-existing so the pipeline
    // never tries to recreate them. An id lookup is exempt from the listing's
    // public-only default, so a single query with no `public` filter returns
    // both visibility sides — no second request per chunk.
    fetchQueue.push(() => conditionsPage([makeNode('0x1'), makeNode('0x2')]));

    const result = await checkExistingConditions('https://api.example.com', [
      '0x1',
      '0x2',
    ]);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.example.com/v2/graphql');
    const filter = JSON.parse(fetchCalls[0].init!.body as string).variables
      .filter;
    expect(filter).toEqual({ conditionIds: ['0x1', '0x2'] });
    expect(filter).not.toHaveProperty('public');
    expect([...result.keys()].sort()).toEqual(['0x1', '0x2']);
  });

  it('chunks large id lists into batches of 100, one request per chunk', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `0x${i + 1}`);
    // 2 chunks × 1 request each = 2 requests.
    for (let i = 0; i < 2; i++) fetchQueue.push(() => conditionsPage([]));

    await checkExistingConditions('https://api.example.com', ids);

    expect(fetchCalls).toHaveLength(2);
    const sizes = fetchCalls.map(
      (c) =>
        JSON.parse(c.init!.body as string).variables.filter.conditionIds.length
    );
    expect(sizes.sort((a, b) => a - b)).toEqual([50, 100]);
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
    // Chunk 1: request errors → whole chunk skipped (warn, continue).
    fetchQueue.push(
      () => new Response('boom', { status: 500, statusText: 'Server Error' })
    );
    // Chunk 2: succeeds.
    fetchQueue.push(() => conditionsPage([makeNode('0x101')]));

    const result = await checkExistingConditions(
      'https://api.example.com',
      ids
    );

    expect(result.has('0x101')).toBe(true);
  });
});
