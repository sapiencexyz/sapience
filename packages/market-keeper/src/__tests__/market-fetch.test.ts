import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolymarketMarket } from '../types';
import { fetchEndingSoonestMarkets } from '../generate/market';
import { fetchWithRetry } from '../utils';

vi.mock('../utils', () => ({
  fetchWithRetry: vi.fn(),
}));

function makeMarket(
  id: number | string,
  endDate = '2026-05-21T00:30:00.000Z',
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: String(id),
    question: `Market ${id}`,
    conditionId: `0x${String(id).padStart(64, '0')}`,
    outcomes: '["Yes","No"]',
    volume: '1000',
    liquidity: '1000',
    endDate,
    description: 'Test market',
    slug: `market-${id}`,
    active: true,
    closed: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('fetchEndingSoonestMarkets', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-20T23:25:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('continues paging when inclusive end_date_min returns a duplicate full page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => makeMarket(i));
    const spursThunderProps = [
      makeMarket('101', '2026-05-21T00:30:00.000Z', {
        question: 'Victor Wembanyama: Points O/U 24.5',
        slug: 'nba-sas-okc-2026-05-20-points-victor-wembanyama-24pt5',
        sportsMarketType: 'points',
      }),
      makeMarket('102', '2026-05-21T00:30:00.000Z', {
        question: 'Shai Gilgeous-Alexander: Rebounds O/U 4.5',
        slug: 'nba-sas-okc-2026-05-20-rebounds-shai-gilgeous-alexander-4pt5',
        sportsMarketType: 'rebounds',
      }),
    ];

    vi.mocked(fetchWithRetry)
      // Initial page advances the cursor to the crowded game start timestamp.
      .mockResolvedValueOnce(jsonResponse(firstPage) as never)
      // Gamma's inclusive end_date_min can return the same full page again.
      .mockResolvedValueOnce(jsonResponse(firstPage) as never)
      // The offset page contains later siblings at that same timestamp.
      .mockResolvedValueOnce(jsonResponse(spursThunderProps) as never)
      // Supplementary event tag fetch.
      .mockResolvedValueOnce(jsonResponse([]) as never);

    const markets = await fetchEndingSoonestMarkets();

    expect(markets.map((m) => m.slug)).toContain(
      'nba-sas-okc-2026-05-20-points-victor-wembanyama-24pt5'
    );
    expect(markets.map((m) => m.slug)).toContain(
      'nba-sas-okc-2026-05-20-rebounds-shai-gilgeous-alexander-4pt5'
    );
    expect(fetchWithRetry).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetchWithRetry).mock.calls[2][0]).toContain('offset=100');
  });
});
