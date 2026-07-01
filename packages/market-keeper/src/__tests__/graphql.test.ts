import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetchWithRetry at the source, same pattern as refresh-metadata.test.ts:
// a recorded array of (url, init) calls plus a queue of canned responses.
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
  graphqlUrl,
  graphqlRequest,
  walkConnection,
  type Connection,
} from '../utils/graphql';
import { fetchActiveConditionIds } from '../sapience/active-conditions';

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

describe('graphqlUrl', () => {
  it('appends /v2/graphql and strips trailing slashes', () => {
    expect(graphqlUrl('https://api.example.com')).toBe(
      'https://api.example.com/v2/graphql'
    );
    expect(graphqlUrl('https://api.example.com//')).toBe(
      'https://api.example.com/v2/graphql'
    );
  });
});

describe('graphqlRequest', () => {
  it('POSTs the query and variables as JSON and returns data', async () => {
    fetchQueue.push(() => jsonResponse({ data: { ok: 1 } }));

    const data = await graphqlRequest<{ ok: number }>(
      'https://api.example.com/v2/graphql',
      'query Q { ok }',
      { a: 1 },
      'Test'
    );

    expect(data).toEqual({ ok: 1 });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].init?.method).toBe('POST');
    const body = JSON.parse(fetchCalls[0].init!.body as string);
    expect(body.query).toBe('query Q { ok }');
    expect(body.variables).toEqual({ a: 1 });
  });

  it('throws on a non-2xx response, including the status in the message', async () => {
    fetchQueue.push(
      () =>
        new Response('boom', {
          status: 500,
          statusText: 'Internal Server Error',
        })
    );

    await expect(
      graphqlRequest('https://x/v2/graphql', 'query Q { ok }', {}, 'Test')
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the response carries GraphQL errors', async () => {
    fetchQueue.push(() =>
      jsonResponse({ errors: [{ message: 'bad filter' }] })
    );

    await expect(
      graphqlRequest('https://x/v2/graphql', 'query Q { ok }', {}, 'Test')
    ).rejects.toThrow(/bad filter/);
  });
});

describe('walkConnection', () => {
  type Node = { id: string };
  type Data = { conditions: Connection<Node> };

  const walk = (onPage: (nodes: Node[]) => boolean | void) =>
    walkConnection<Node, Data>({
      graphqlUrl: 'https://api.example.com/v2/graphql',
      query: 'query Q($first: Int!, $after: String) { ... }',
      label: 'Test',
      select: (data) => data.conditions,
      onPage,
    });

  it('follows endCursor until hasNextPage is false', async () => {
    fetchQueue.push(() =>
      conditionsPage([{ id: 'a' }], { hasNextPage: true, endCursor: 'c1' })
    );
    fetchQueue.push(() =>
      conditionsPage([{ id: 'b' }], { hasNextPage: false, endCursor: 'c2' })
    );

    const seen: string[] = [];
    await walk((nodes) => {
      seen.push(...nodes.map((n) => n.id));
    });

    expect(seen).toEqual(['a', 'b']);
    expect(fetchCalls).toHaveLength(2);
    const first = JSON.parse(fetchCalls[0].init!.body as string);
    const second = JSON.parse(fetchCalls[1].init!.body as string);
    expect(first.variables.first).toBe(25);
    expect(second.variables.first).toBe(25);
    expect(first.variables.after).toBeNull();
    expect(second.variables.after).toBe('c1');
  });

  it('stops early when onPage returns false', async () => {
    fetchQueue.push(() =>
      conditionsPage([{ id: 'a' }], { hasNextPage: true, endCursor: 'c1' })
    );

    await walk(() => false);

    expect(fetchCalls).toHaveLength(1);
  });
});

describe('fetchActiveConditionIds', () => {
  it('queries /v2/graphql for public unsettled conditions', async () => {
    fetchQueue.push(() =>
      conditionsPage([], { hasNextPage: false, endCursor: null })
    );

    await fetchActiveConditionIds('https://api.example.com');

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.example.com/v2/graphql');
    const body = JSON.parse(fetchCalls[0].init!.body as string);
    expect(body.variables.filter).toEqual({ public: true, settled: false });
  });

  it('keeps only conditions with a non-empty similarMarket.markets, deduped', async () => {
    // There is no `similarMarkets isEmpty` server-side filter, so
    // the Polymarket-linked cut happens client-side.
    fetchQueue.push(() =>
      conditionsPage(
        [
          { conditionId: '0x1', similarMarket: { markets: ['https://pm/x'] } },
          { conditionId: '0x2', similarMarket: { markets: [] } },
          { conditionId: '0x3', similarMarket: null },
          { conditionId: '0x1', similarMarket: { markets: ['https://pm/x'] } },
        ],
        { hasNextPage: false, endCursor: null }
      )
    );

    const ids = await fetchActiveConditionIds('https://api.example.com');
    expect(ids).toEqual(['0x1']);
  });

  it('paginates via the relay cursor until exhausted', async () => {
    fetchQueue.push(() =>
      conditionsPage(
        [{ conditionId: '0x1', similarMarket: { markets: ['m'] } }],
        { hasNextPage: true, endCursor: 'cur1' }
      )
    );
    fetchQueue.push(() =>
      conditionsPage(
        [{ conditionId: '0x2', similarMarket: { markets: ['m'] } }],
        { hasNextPage: false, endCursor: null }
      )
    );

    const ids = await fetchActiveConditionIds('https://api.example.com');

    expect(ids).toEqual(['0x1', '0x2']);
    expect(JSON.parse(fetchCalls[1].init!.body as string).variables.after).toBe(
      'cur1'
    );
  });
});
