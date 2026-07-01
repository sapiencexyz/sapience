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

import {
  fetchNoEngagementConditions,
  fetchConditionsWithEngagement,
} from '../cleanup/api';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

const exhaustedPage = { hasNextPage: false, endCursor: null };

function conditionsPage(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = exhaustedPage
): Response {
  return jsonResponse({ data: { conditions: { nodes, pageInfo } } });
}

function forecastsPage(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = exhaustedPage
): Response {
  return jsonResponse({ data: { forecasts: { nodes, pageInfo } } });
}

function conditionNode(
  conditionId: string,
  openInterest: string | number = '0'
) {
  return { conditionId, openInterest, question: `Q ${conditionId}` };
}

function requestBody(call: FetchCall) {
  return JSON.parse(call.init!.body as string);
}

describe('fetchNoEngagementConditions', () => {
  it('walks conditions ordered by openInterest ascending and stops at the first non-zero row', async () => {
    // There is no `openInterest = 0` server-side filter; ascending
    // openInterest order makes the zero-OI prefix exhaustive, so the walk
    // stops at the first non-zero row instead of paging the whole table.
    fetchQueue.push(() =>
      conditionsPage(
        [
          conditionNode('0xa', '0'),
          conditionNode('0xb', 0),
          conditionNode('0xc', '500'),
        ],
        { hasNextPage: true, endCursor: 'cur1' }
      )
    );
    // Engagement re-check for the two candidates: no forecasts.
    fetchQueue.push(() => forecastsPage([]));

    const result = await fetchNoEngagementConditions('https://api.example.com');

    expect(result.map((c) => c.id)).toEqual(['0xa', '0xb']);
    // Only one conditions page despite hasNextPage — the non-zero row ends
    // the zero-OI prefix.
    const conditionCalls = fetchCalls.filter((c) =>
      requestBody(c).query.includes('conditions(')
    );
    expect(conditionCalls).toHaveLength(1);
    const body = requestBody(conditionCalls[0]);
    expect(body.variables.filter).toEqual({ public: true, settled: false });
    expect(body.query).toMatch(/OPEN_INTEREST/);
    expect(body.query).toMatch(/ASC/);
    expect(fetchCalls[0].url).toBe('https://api.example.com/v2/graphql');
  });

  it('excludes candidates that already carry forecasts', async () => {
    fetchQueue.push(() =>
      conditionsPage([conditionNode('0xa'), conditionNode('0xb')])
    );
    fetchQueue.push(() => forecastsPage([{ conditionId: '0xa' }]));

    const result = await fetchNoEngagementConditions('https://api.example.com');

    expect(result.map((c) => c.id)).toEqual(['0xb']);
    const forecastCall = fetchCalls.find((c) =>
      requestBody(c).query.includes('forecasts(')
    );
    expect(requestBody(forecastCall!).variables.filter).toEqual({
      conditionIds: ['0xa', '0xb'],
    });
  });

  it('maps candidates onto the CleanupCondition shape', async () => {
    fetchQueue.push(() => conditionsPage([conditionNode('0xa')]));
    fetchQueue.push(() => forecastsPage([]));

    const result = await fetchNoEngagementConditions('https://api.example.com');

    expect(result).toEqual([
      {
        id: '0xa',
        openInterest: '0',
        question: 'Q 0xa',
        attestationCount: 0,
      },
    ]);
  });

  it('paginates conditions while the zero-OI prefix continues', async () => {
    fetchQueue.push(() =>
      conditionsPage([conditionNode('0xa')], {
        hasNextPage: true,
        endCursor: 'cur1',
      })
    );
    fetchQueue.push(() => conditionsPage([conditionNode('0xb')]));
    fetchQueue.push(() => forecastsPage([]));

    const result = await fetchNoEngagementConditions('https://api.example.com');

    expect(result.map((c) => c.id)).toEqual(['0xa', '0xb']);
    expect(requestBody(fetchCalls[1]).variables.after).toBe('cur1');
  });
});

describe('fetchConditionsWithEngagement', () => {
  it('returns [] immediately for an empty id list', async () => {
    const result = await fetchConditionsWithEngagement(
      'https://api.example.com',
      []
    );
    expect(result).toEqual([]);
    expect(fetchCalls).toHaveLength(0);
  });

  it('flags engagement from non-zero openInterest or from forecasts', async () => {
    // The re-check runs right after cleanup privated these conditions, so the
    // hidden side is where the rows live — but an id-filtered query is exempt
    // from the public-only listing default, so one query (no `public` filter)
    // returns both visibility sides. A second forecasts query catches rows
    // with attestations but zero OI.
    fetchQueue.push(() =>
      conditionsPage([
        conditionNode('0xa', '5'),
        conditionNode('0xb', '0'),
        conditionNode('0xc', '7'),
      ])
    );
    fetchQueue.push(() => forecastsPage([{ conditionId: '0xd' }]));

    const result = await fetchConditionsWithEngagement(
      'https://api.example.com',
      ['0xa', '0xb', '0xc', '0xd']
    );

    expect(result.sort()).toEqual(['0xa', '0xc', '0xd']);
    const filters = fetchCalls.map((c) => requestBody(c).variables.filter);
    expect(filters).toEqual([
      { conditionIds: ['0xa', '0xb', '0xc', '0xd'] },
      { conditionIds: ['0xa', '0xb', '0xc', '0xd'] },
    ]);
  });

  it('chunks id lists larger than the GraphQL page size', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `0x${i + 1}`);
    // Page size is capped at 25 (GRAPHQL_PAGE_SIZE), so 60 ids split into
    // chunks of 25, 25, 10 — each chunk issues a conditions + a forecasts call.
    for (let i = 0; i < 6; i++) {
      fetchQueue.push((): Response => {
        return jsonResponse({
          data: {
            conditions: { nodes: [], pageInfo: exhaustedPage },
            forecasts: { nodes: [], pageInfo: exhaustedPage },
          },
        });
      });
    }

    await fetchConditionsWithEngagement('https://api.example.com', ids);

    expect(fetchCalls).toHaveLength(6);
    const sizes = fetchCalls.map(
      (c) => requestBody(c).variables.filter.conditionIds.length
    );
    expect(sizes).toEqual([25, 25, 25, 25, 10, 10]);
  });
});
