import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PolymarketMarket } from '../types';

// market.ts pulls fetchWithRetry from ../utils and the filter pipeline from
// ../generate/pipeline. Mock both so the test exercises ONLY the pagination
// loop, not the network or the binary-market filters.
vi.mock('../utils', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('../generate/pipeline', () => ({
  runPipeline: vi.fn((input: unknown[]) => ({ output: input, stats: {} })),
  printPipelineStats: vi.fn(),
  MARKET_FILTERS: [],
}));

import { fetchPastEndDateMarkets } from '../relist/market';
import { fetchWithRetry } from '../utils';

const mockFetch = vi.mocked(fetchWithRetry);

function makeMarket(conditionId: string): PolymarketMarket {
  return {
    id: conditionId,
    question: 'Will X happen?',
    conditionId,
    outcomes: ['Yes', 'No'],
    volume: '50000',
    liquidity: '5000',
    // Past endDate so it survives the client-side `endDate < now` filter.
    endDate: '2020-01-01T00:00:00Z',
    description: 'Test market',
    slug: 'test-market',
    active: true,
    closed: false,
  } as PolymarketMarket;
}

// Build a /markets/keyset envelope response. `nextCursor === undefined` omits
// the key entirely, which is how the live API signals the final page.
function keysetPage(
  markets: PolymarketMarket[],
  nextCursor?: string
): Response {
  const body: Record<string, unknown> = { markets };
  if (nextCursor !== undefined) body.next_cursor = nextCursor;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPastEndDateMarkets — keyset pagination', () => {
  it('hits /markets/keyset and never uses offset', async () => {
    mockFetch.mockResolvedValueOnce(keysetPage([makeMarket('0x1')]));

    await fetchPastEndDateMarkets();

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('/markets/keyset');
    expect(url).not.toContain('offset=');
  });

  it('follows next_cursor via after_cursor and aggregates across pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        keysetPage([makeMarket('0x1'), makeMarket('0x2')], 'CUR1')
      )
      .mockResolvedValueOnce(keysetPage([makeMarket('0x3')])); // no next_cursor → last page

    const result = await fetchPastEndDateMarkets();

    expect(result.map((m) => m.conditionId)).toEqual(['0x1', '0x2', '0x3']);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstUrl = String(mockFetch.mock.calls[0][0]);
    const secondUrl = String(mockFetch.mock.calls[1][0]);
    expect(firstUrl).not.toContain('after_cursor');
    expect(secondUrl).toContain('after_cursor=CUR1');
  });

  it('stops when next_cursor is absent even on a full page (no 422, no offset cap)', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) =>
      makeMarket(`0x${i}`)
    );
    // Full page but NO next_cursor → authoritative end-of-results signal.
    mockFetch.mockResolvedValueOnce(keysetPage(fullPage));

    const result = await fetchPastEndDateMarkets();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(100);
  });

  it('does not loop forever if the cursor stops advancing (stuck-cursor guard)', async () => {
    // Regression guard for Polymarket/agents#227: a server that keeps echoing
    // the same next_cursor must not spin into an infinite fetch loop.
    mockFetch.mockResolvedValue(keysetPage([makeMarket('0x1')], 'STUCK'));

    const result = await fetchPastEndDateMarkets();

    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.map((m) => m.conditionId)).toEqual(['0x1']);
  });
});
