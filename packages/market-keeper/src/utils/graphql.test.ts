import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
const fetchQueue: Array<() => Response> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

vi.mock('./fetch', () => ({
  fetchWithRetry: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const next = fetchQueue.shift();
    if (!next) throw new Error(`No queued response for ${url}`);
    return next();
  }),
}));

import { graphqlRequest } from './graphql';

const URL = 'https://api.example.com/v2/graphql';
const QUERY = 'query Q { ping }';
// baseDelayMs: 0 keeps backoff out of test wall-clock time
const OPTS = { baseDelayMs: 0 };

function errorResponse(message: string): Response {
  return jsonResponse({ errors: [{ message }] });
}

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

describe('graphqlRequest transient-error retry', () => {
  it('retries a Query timeout error and returns data from the next attempt', async () => {
    fetchQueue.push(() =>
      errorResponse('Query timeout: Condition.findMany exceeded 8000ms')
    );
    fetchQueue.push(() => jsonResponse({ data: { ping: 'pong' } }));

    const data = await graphqlRequest<{ ping: string }>(
      URL,
      QUERY,
      {},
      'Test',
      OPTS
    );

    expect(data).toEqual({ ping: 'pong' });
    expect(fetchCalls).toHaveLength(2);
  });

  it('retries connection-pool exhaustion errors', async () => {
    fetchQueue.push(() =>
      errorResponse('Timed out fetching a new connection from the pool')
    );
    fetchQueue.push(() => jsonResponse({ data: { ping: 'pong' } }));

    const data = await graphqlRequest<{ ping: string }>(
      URL,
      QUERY,
      {},
      'Test',
      OPTS
    );

    expect(data).toEqual({ ping: 'pong' });
    expect(fetchCalls).toHaveLength(2);
  });

  it('throws immediately on a non-transient GraphQL error without retrying', async () => {
    fetchQueue.push(() =>
      errorResponse('Variable "$filter" got invalid value')
    );

    await expect(graphqlRequest(URL, QUERY, {}, 'Test', OPTS)).rejects.toThrow(
      /invalid value/
    );
    expect(fetchCalls).toHaveLength(1);
  });

  it('throws the transient error once retries are exhausted', async () => {
    const maxRetries = 2;
    for (let i = 0; i <= maxRetries; i++) {
      fetchQueue.push(() =>
        errorResponse('Query timeout: Condition.findMany exceeded 8000ms')
      );
    }

    await expect(
      graphqlRequest(URL, QUERY, {}, 'Test', { maxRetries, baseDelayMs: 0 })
    ).rejects.toThrow(/Query timeout/);
    expect(fetchCalls).toHaveLength(maxRetries + 1);
  });

  it('does not retry a response with no data and no errors', async () => {
    fetchQueue.push(() => jsonResponse({}));

    await expect(graphqlRequest(URL, QUERY, {}, 'Test', OPTS)).rejects.toThrow(
      /no data/
    );
    expect(fetchCalls).toHaveLength(1);
  });
});
