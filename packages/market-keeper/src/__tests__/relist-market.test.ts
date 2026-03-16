import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RELIST_GRACE_PERIOD_DAYS } from '../constants';

vi.mock('../utils', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('../generate/pipeline', () => ({
  runPipeline: vi.fn(
    (items: unknown[]) => ({ output: items, removed: [], stats: [] }) as never
  ),
  printPipelineStats: vi.fn(),
  MARKET_FILTERS: [],
}));

import { fetchPastEndDateMarkets } from '../relist/market';
import { fetchWithRetry } from '../utils';

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPastEndDateMarkets', () => {
  it(`uses end_date_max = now - ${RELIST_GRACE_PERIOD_DAYS} days (grace period)`, async () => {
    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as never);

    const before = Date.now();
    await fetchPastEndDateMarkets();
    const after = Date.now();

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    const url = mockFetchWithRetry.mock.calls[0][0] as string;

    const endDateMaxMatch = url.match(/end_date_max=([^&]+)/);
    expect(endDateMaxMatch).not.toBeNull();

    const endDateMax = new Date(endDateMaxMatch![1]).getTime();
    const gracePeriodMs = RELIST_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    // end_date_max should be approximately now - grace period (within 5s tolerance)
    expect(endDateMax).toBeGreaterThanOrEqual(before - gracePeriodMs - 5000);
    expect(endDateMax).toBeLessThanOrEqual(after - gracePeriodMs + 5000);
  });

  it('filters out markets with endDate newer than the grace period cutoff', async () => {
    const now = Date.now();
    const gracePeriodMs = RELIST_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    const markets = [
      {
        conditionId: '0x1',
        endDate: new Date(now - gracePeriodMs - 86400000).toISOString(), // 3 days ago — past grace
        outcomes: ['Yes', 'No'],
        archived: false,
      },
      {
        conditionId: '0x2',
        endDate: new Date(now - 3600000).toISOString(), // 1 hour ago — within grace
        outcomes: ['Yes', 'No'],
        archived: false,
      },
    ];

    mockFetchWithRetry.mockResolvedValue({
      ok: true,
      json: async () => markets,
    } as never);

    const result = await fetchPastEndDateMarkets();

    // Only the market past the grace period should be included
    expect(result).toHaveLength(1);
    expect(result[0].conditionId).toBe('0x1');
  });
});
