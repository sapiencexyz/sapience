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

import { fetchAllUnsettledConditions } from '../refresh-imminent-tag/fetch';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

function conditionsPage(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
) {
  return jsonResponse({ data: { conditions: { nodes, pageInfo } } });
}

describe('fetchAllUnsettledConditions', () => {
  it('queries /v2/graphql for public + unsettled conditions, newest first', async () => {
    fetchQueue.push(() =>
      conditionsPage([], { hasNextPage: false, endCursor: null })
    );

    await fetchAllUnsettledConditions('https://api.example.com', null);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.example.com/v2/graphql');
    const body = JSON.parse(fetchCalls[0].init!.body as string);
    expect(body.variables.filter).toEqual({ public: true, settled: false });
    // Newest-first so a --limit sample biases toward markets most likely to
    // mention today's/tomorrow's date.
    expect(body.query).toMatch(/CREATED_AT/);
    expect(body.query).toMatch(/DESC/);
  });

  it('maps nodes onto PageItem, defaulting tags to [] and description to ""', async () => {
    fetchQueue.push(() =>
      conditionsPage(
        [
          {
            conditionId: '0x1',
            question: 'Q1?',
            description: 'D1',
            tags: ['sports'],
          },
          {
            conditionId: '0x2',
            question: 'Q2?',
            description: null,
            tags: null,
          },
        ],
        { hasNextPage: false, endCursor: null }
      )
    );

    const out = await fetchAllUnsettledConditions(
      'https://api.example.com',
      null
    );

    expect(out).toEqual([
      { id: '0x1', question: 'Q1?', description: 'D1', tags: ['sports'] },
      { id: '0x2', question: 'Q2?', description: '', tags: [] },
    ]);
  });

  it('requests the description field in the GraphQL query', async () => {
    fetchQueue.push(() =>
      conditionsPage([], { hasNextPage: false, endCursor: null })
    );

    await fetchAllUnsettledConditions('https://api.example.com', null);

    const body = JSON.parse(fetchCalls[0].init!.body as string);
    expect(body.query).toMatch(/description/);
  });

  it('paginates via the relay cursor until exhausted', async () => {
    fetchQueue.push(() =>
      conditionsPage([{ conditionId: '0x1', question: 'A', tags: [] }], {
        hasNextPage: true,
        endCursor: 'cur1',
      })
    );
    fetchQueue.push(() =>
      conditionsPage([{ conditionId: '0x2', question: 'B', tags: [] }], {
        hasNextPage: false,
        endCursor: null,
      })
    );

    const out = await fetchAllUnsettledConditions(
      'https://api.example.com',
      null
    );

    expect(out.map((c) => c.id)).toEqual(['0x1', '0x2']);
    expect(JSON.parse(fetchCalls[1].init!.body as string).variables.after).toBe(
      'cur1'
    );
  });

  it('stops paginating once maxResults is reached', async () => {
    fetchQueue.push(() =>
      conditionsPage(
        [
          { conditionId: '0x1', question: 'A', tags: [] },
          { conditionId: '0x2', question: 'B', tags: [] },
        ],
        { hasNextPage: true, endCursor: 'cur1' }
      )
    );

    const out = await fetchAllUnsettledConditions('https://api.example.com', 2);

    expect(out).toHaveLength(2);
    expect(fetchCalls).toHaveLength(1);
  });
});
