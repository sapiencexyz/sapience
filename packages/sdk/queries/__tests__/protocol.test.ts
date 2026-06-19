import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchProtocolAnalytics,
  GET_PROTOCOL_ANALYTICS,
  GET_PROTOCOL_STATS_HISTORY_PAGE,
} from '../protocol';

const mockGraphqlRequestV2 = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const stat = (timestamp: number, overrides: Record<string, unknown> = {}) => ({
  timestamp,
  cumulativeVolume: '1000',
  cumulativeTradeCount: 10,
  periodVolume: '100',
  periodTradeCount: 2,
  openInterest: '500',
  escrowBalance: '400',
  totalValueLocked: '900',
  ...overrides,
});

const fullResponse = () => ({
  protocol: {
    stats: stat(1700000300),
    statsHistory: {
      nodes: [stat(1700000100), stat(1700000200)],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    openInterestByCategory: [
      { category: { name: 'Crypto', slug: 'crypto' }, openInterest: '300' },
      { category: { name: 'Politics', slug: 'politics' }, openInterest: '200' },
    ],
    openInterestByTimeToResolution: [
      {
        minSecondsFromNow: null,
        maxSecondsFromNow: 86400,
        openInterest: '100',
        predictionCount: 3,
      },
      {
        minSecondsFromNow: 86400,
        maxSecondsFromNow: 604800,
        openInterest: '400',
        predictionCount: 7,
      },
      {
        minSecondsFromNow: 15552000,
        maxSecondsFromNow: null,
        openInterest: '50',
        predictionCount: 1,
      },
    ],
  },
});

describe('GET_PROTOCOL_ANALYTICS document', () => {
  test('queries the protocol singleton with all four analytics surfaces', () => {
    expect(GET_PROTOCOL_ANALYTICS).toContain('protocol');
    expect(GET_PROTOCOL_ANALYTICS).toContain('stats');
    expect(GET_PROTOCOL_ANALYTICS).toContain(
      'statsHistory(interval: $interval, first: $first, after: $after)'
    );
    expect(GET_PROTOCOL_ANALYTICS).toContain('$interval: TimeInterval');
    expect(GET_PROTOCOL_ANALYTICS).toContain('hasNextPage');
    expect(GET_PROTOCOL_ANALYTICS).toContain('openInterestByCategory');
    expect(GET_PROTOCOL_ANALYTICS).toContain('openInterestByTimeToResolution');
  });

  test('uses v2 field names: totalValueLocked + cumulativeTradeCount', () => {
    expect(GET_PROTOCOL_ANALYTICS).toContain('totalValueLocked');
    expect(GET_PROTOCOL_ANALYTICS).toContain('cumulativeTradeCount');
    // v1-only fields must not appear.
    expect(GET_PROTOCOL_ANALYTICS).not.toContain('totalTradeCount');
    expect(GET_PROTOCOL_ANALYTICS).not.toContain('vaultAvailableAssets');
    expect(GET_PROTOCOL_ANALYTICS).not.toContain('vaultBalance');
  });

  test('TTR buckets carry explicit bounds; categories are slug-keyed without row ids', () => {
    expect(GET_PROTOCOL_ANALYTICS).toContain('minSecondsFromNow');
    expect(GET_PROTOCOL_ANALYTICS).toContain('maxSecondsFromNow');
    expect(GET_PROTOCOL_ANALYTICS).toContain('predictionCount');
    expect(GET_PROTOCOL_ANALYTICS).toContain('slug');
    expect(GET_PROTOCOL_ANALYTICS).not.toMatch(/\bid\b/);
    // v1 server-computed bucket label/index are gone.
    expect(GET_PROTOCOL_ANALYTICS).not.toContain('label');
    expect(GET_PROTOCOL_ANALYTICS).not.toContain('bucket');
  });
});

describe('fetchProtocolAnalytics', () => {
  test('requests the daily-bucketed series in one page (interval DAY, first null)', async () => {
    mockGraphqlRequestV2.mockResolvedValue(fullResponse());
    await fetchProtocolAnalytics();
    expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_PROTOCOL_ANALYTICS, {
      interval: 'DAY',
      first: null,
      after: null,
    });
  });

  test('pages statsHistory on pageInfo until exhausted, then concatenates', async () => {
    const page1 = fullResponse();
    page1.protocol.statsHistory = {
      nodes: [stat(1700000100), stat(1700000200)],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    };
    mockGraphqlRequestV2.mockResolvedValueOnce(page1).mockResolvedValueOnce({
      protocol: {
        statsHistory: {
          nodes: [stat(1700000300)],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await fetchProtocolAnalytics();

    expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    // First call: the combined analytics query, daily-bucketed first page.
    expect(mockGraphqlRequestV2).toHaveBeenNthCalledWith(
      1,
      GET_PROTOCOL_ANALYTICS,
      { interval: 'DAY', first: null, after: null }
    );
    // Second call: the lighter history-only page query, threading the cursor.
    expect(mockGraphqlRequestV2).toHaveBeenNthCalledWith(
      2,
      GET_PROTOCOL_STATS_HISTORY_PAGE,
      { interval: 'DAY', first: null, after: 'cursor-1' }
    );
    expect(result.statsHistory.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000200, 1700000300,
    ]);
  });

  test('unwraps the protocol payload, with history as a plain array', async () => {
    mockGraphqlRequestV2.mockResolvedValue(fullResponse());

    const result = await fetchProtocolAnalytics();
    expect(result.stats.timestamp).toBe(1700000300);
    expect(result.stats.totalValueLocked).toBe('900');
    expect(result.statsHistory.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000200,
    ]);
    expect(result.openInterestByCategory).toEqual([
      { category: { name: 'Crypto', slug: 'crypto' }, openInterest: '300' },
      { category: { name: 'Politics', slug: 'politics' }, openInterest: '200' },
    ]);
    expect(result.openInterestByTimeToResolution).toHaveLength(3);
  });

  test('normalizes BigInt-scalar wire values to decimal strings', async () => {
    const resp = fullResponse();
    // The BigInt scalar may serialize as number depending on transport.
    resp.protocol.stats = stat(1700000300, {
      cumulativeVolume: 1000,
      openInterest: 500,
      escrowBalance: 400,
      totalValueLocked: 900,
      periodVolume: 100,
    }) as never;
    mockGraphqlRequestV2.mockResolvedValue(resp);

    const result = await fetchProtocolAnalytics();
    expect(result.stats.cumulativeVolume).toBe('1000');
    expect(result.stats.openInterest).toBe('500');
    expect(result.stats.escrowBalance).toBe('400');
    expect(result.stats.totalValueLocked).toBe('900');
    expect(result.stats.periodVolume).toBe('100');
  });

  test('sorts history snapshots oldest-first even if the server misbehaves', async () => {
    const resp = fullResponse();
    resp.protocol.statsHistory.nodes = [
      stat(1700000200),
      stat(1700000100),
      stat(1700000150),
    ];
    mockGraphqlRequestV2.mockResolvedValue(resp);

    const result = await fetchProtocolAnalytics();
    expect(result.statsHistory.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000150, 1700000200,
    ]);
  });

  test('sorts TTR buckets by maxSecondsFromNow with the open-ended tail last', async () => {
    const resp = fullResponse();
    resp.protocol.openInterestByTimeToResolution = [
      resp.protocol.openInterestByTimeToResolution[2], // tail (max null)
      resp.protocol.openInterestByTimeToResolution[1], // (1d, 7d]
      resp.protocol.openInterestByTimeToResolution[0], // (null, 1d]
    ];
    mockGraphqlRequestV2.mockResolvedValue(resp);

    const result = await fetchProtocolAnalytics();
    expect(
      result.openInterestByTimeToResolution.map((b) => b.maxSecondsFromNow)
    ).toEqual([86400, 604800, null]);
  });

  test('drops unexpected fields from category nodes (no numeric row ids)', async () => {
    const resp = fullResponse();
    resp.protocol.openInterestByCategory = [
      {
        category: { id: 7, name: 'Crypto', slug: 'crypto' },
        openInterest: '300',
      } as never,
    ];
    mockGraphqlRequestV2.mockResolvedValue(resp);

    const result = await fetchProtocolAnalytics();
    expect(result.openInterestByCategory[0].category).toEqual({
      name: 'Crypto',
      slug: 'crypto',
    });
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequestV2.mockResolvedValue(null);
    await expect(fetchProtocolAnalytics()).rejects.toThrow(
      'Failed to fetch protocol analytics: Invalid response structure'
    );

    mockGraphqlRequestV2.mockResolvedValue({});
    await expect(fetchProtocolAnalytics()).rejects.toThrow(
      'Failed to fetch protocol analytics: Invalid response structure'
    );
  });
});
