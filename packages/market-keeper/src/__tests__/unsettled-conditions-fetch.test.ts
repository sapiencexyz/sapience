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

import { fetchConditionIdsWithUnsettledPredictions } from '../sapience/unsettled-conditions';

beforeEach(() => {
  fetchCalls.length = 0;
  fetchQueue.length = 0;
  vi.clearAllMocks();
});

const exhaustedPage = { hasNextPage: false, endCursor: null };

function predictionsPage(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = exhaustedPage
): Response {
  return jsonResponse({ data: { predictions: { nodes, pageInfo } } });
}

function predictionNode(
  picks: Array<{ conditionId: string; resolver: string }>,
  resolved = false
) {
  return { pickConfig: { resolved, picks } };
}

function requestBody(call: FetchCall) {
  return JSON.parse(call.init!.body as string);
}

const RESOLVER_A = '0xC7A489F8b5CEf914fcA2511a84cdC0221cD9a0F4';
const RESOLVER_B = '0x19e34DB5bef20EF0613854c3670cD809DEFf4035';

describe('fetchConditionIdsWithUnsettledPredictions', () => {
  it('queries the v2 endpoint for unsettled predictions', async () => {
    fetchQueue.push(() => predictionsPage([]));

    await fetchConditionIdsWithUnsettledPredictions('https://api.sapience.xyz');

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.sapience.xyz/v2/graphql');
    const body = requestBody(fetchCalls[0]);
    expect(body.variables.filter).toEqual({ settled: false });
  });

  it('groups condition ids by lowercased pick resolver and dedupes', async () => {
    fetchQueue.push(() =>
      predictionsPage([
        predictionNode([
          { conditionId: '0xAAA1', resolver: RESOLVER_A },
          { conditionId: '0xBBB1', resolver: RESOLVER_B },
        ]),
        // Same condition again on another prediction — must dedupe
        predictionNode([{ conditionId: '0xaaa1', resolver: RESOLVER_A }]),
        predictionNode([{ conditionId: '0xAAA2', resolver: RESOLVER_A }]),
      ])
    );

    const byResolver = await fetchConditionIdsWithUnsettledPredictions(
      'https://api.sapience.xyz'
    );

    expect(byResolver.get(RESOLVER_A.toLowerCase())).toEqual(
      new Set(['0xaaa1', '0xaaa2'])
    );
    expect(byResolver.get(RESOLVER_B.toLowerCase())).toEqual(
      new Set(['0xbbb1'])
    );
  });

  it('skips predictions whose pickConfig is resolved or missing', async () => {
    fetchQueue.push(() =>
      predictionsPage([
        // Resolved pickConfig: nothing left to bridge for this prediction
        predictionNode([{ conditionId: '0xaaa1', resolver: RESOLVER_A }], true),
        // RPC-error rows have no pickConfig at all
        { pickConfig: null },
        predictionNode([{ conditionId: '0xbbb1', resolver: RESOLVER_A }]),
      ])
    );

    const byResolver = await fetchConditionIdsWithUnsettledPredictions(
      'https://api.sapience.xyz'
    );

    expect(byResolver.get(RESOLVER_A.toLowerCase())).toEqual(
      new Set(['0xbbb1'])
    );
  });

  it('walks every page of the connection', async () => {
    fetchQueue.push(() =>
      predictionsPage(
        [predictionNode([{ conditionId: '0xaaa1', resolver: RESOLVER_A }])],
        { hasNextPage: true, endCursor: 'cursor-1' }
      )
    );
    fetchQueue.push(() =>
      predictionsPage([
        predictionNode([{ conditionId: '0xaaa2', resolver: RESOLVER_A }]),
      ])
    );

    const byResolver = await fetchConditionIdsWithUnsettledPredictions(
      'https://api.sapience.xyz'
    );

    expect(fetchCalls).toHaveLength(2);
    expect(requestBody(fetchCalls[1]).variables.after).toBe('cursor-1');
    expect(byResolver.get(RESOLVER_A.toLowerCase())).toEqual(
      new Set(['0xaaa1', '0xaaa2'])
    );
  });
});
