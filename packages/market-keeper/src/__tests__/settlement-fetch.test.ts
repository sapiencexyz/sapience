import { beforeEach, describe, expect, it, vi } from 'vitest';

type FetchCall = { url: string; init?: RequestInit };
const fetchCalls: FetchCall[] = [];
const fetchQueue: Array<() => Response> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('../utils', () => ({
  fetchWithRetry: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const next = fetchQueue.shift();
    if (!next) throw new Error(`No queued response for ${url}`);
    return next();
  }),
}));

import { fetchResolverConditions } from '../settlement/fetchConditions';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

describe('fetchResolverConditions', () => {
  it('uses Relay pagination and returns on-chain condition IDs', async () => {
    fetchQueue.push(() =>
      jsonResponse({
        data: {
          conditionsConnection: {
            nodes: [{ id: '0x1', question: 'Will it work?' }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        },
      })
    );
    fetchQueue.push(() =>
      jsonResponse({
        data: {
          conditionsConnection: {
            nodes: [{ id: '0x2', question: 'Will it keep working?' }],
            pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
          },
        },
      })
    );

    const conditions = await fetchResolverConditions(
      'https://api.example.com/graphql',
      '0xResolver'
    );

    expect(conditions).toEqual([
      { id: '0x1', question: 'Will it work?' },
      { id: '0x2', question: 'Will it keep working?' },
    ]);
    expect(fetchCalls).toHaveLength(2);

    const firstBody = JSON.parse(fetchCalls[0].init?.body as string) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const secondBody = JSON.parse(fetchCalls[1].init?.body as string) as {
      variables: Record<string, unknown>;
    };

    expect(firstBody.query).toContain('after: $after');
    expect(firstBody.query).toContain('$resolver: Address!');
    expect(firstBody.query).toContain('resolverAddress: $resolver');
    expect(firstBody.query).toContain('nodes');
    expect(firstBody.query).toContain('pageInfo');
    expect(firstBody.query).toContain('id: conditionId');
    expect(firstBody.query).not.toContain('skip:');
    expect(firstBody.query).not.toContain('items');
    expect(firstBody.query).not.toContain('hasMore');
    expect(firstBody.variables).toEqual({
      resolver: '0xResolver',
      first: 30,
      after: null,
    });
    expect(secondBody.variables.after).toBe('cursor-1');
  });
});
