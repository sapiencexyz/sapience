import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchLeaderboard,
  fetchAccuracyLeaderboard,
  fetchForecasterRank,
  fetchUserProfitRank,
  GET_PROFIT_LEADERBOARD,
  GET_ACCURACY_LEADERBOARD,
  GET_FORECASTER_RANK,
  GET_USER_PROFIT_RANK,
} from '../leaderboard';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// fetchLeaderboard — v2 leaderboard(metric: PNL)
// ============================================================================

describe('fetchLeaderboard', () => {
  test('queries the v2 PNL leaderboard connection', () => {
    expect(GET_PROFIT_LEADERBOARD).toContain(
      'leaderboard(metric: PNL, first: 100)'
    );
    expect(GET_PROFIT_LEADERBOARD).toContain('pnlFormatted');
    expect(GET_PROFIT_LEADERBOARD).toContain('account');
    expect(GET_PROFIT_LEADERBOARD).toContain('address');
    expect(GET_PROFIT_LEADERBOARD).not.toContain('profitLeaderboard');
  });

  test('maps ranking edges to { address, totalPnL } with totalPnL := pnlFormatted', async () => {
    mockGraphqlRequest.mockResolvedValue({
      leaderboard: {
        edges: [
          {
            node: {
              rank: 1,
              pnlFormatted: '1000.5',
              account: { address: '0xbob' },
            },
          },
          {
            node: {
              rank: 2,
              pnlFormatted: '-50',
              account: { address: '0xalice' },
            },
          },
        ],
      },
    });

    const result = await fetchLeaderboard();
    expect(result).toEqual([
      { address: '0xbob', totalPnL: '1000.5' },
      { address: '0xalice', totalPnL: '-50' },
    ]);
    // No internal/extra fields leak (rank is derivable from order).
    expect(Object.keys(result[0])).toEqual(['address', 'totalPnL']);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_PROFIT_LEADERBOARD);
  });

  test('returns empty array when connection has no edges', async () => {
    mockGraphqlRequest.mockResolvedValue({ leaderboard: { edges: [] } });
    const result = await fetchLeaderboard();
    expect(result).toEqual([]);
  });

  test('returns empty array when leaderboard is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({ leaderboard: null });
    const result = await fetchLeaderboard();
    expect(result).toEqual([]);
  });

  test('caps results at 100 entries', async () => {
    const edges = Array.from({ length: 150 }, (_, i) => ({
      node: {
        rank: i + 1,
        pnlFormatted: `${150 - i}`,
        account: { address: `0x${i.toString(16).padStart(40, '0')}` },
      },
    }));
    mockGraphqlRequest.mockResolvedValue({ leaderboard: { edges } });

    const result = await fetchLeaderboard();
    expect(result).toHaveLength(100);
  });
});

// ============================================================================
// fetchAccuracyLeaderboard — v2 leaderboard(metric: ACCURACY)
// ============================================================================

describe('fetchAccuracyLeaderboard', () => {
  test('queries the v2 ACCURACY leaderboard connection', () => {
    expect(GET_ACCURACY_LEADERBOARD).toContain(
      'leaderboard(metric: ACCURACY, first: $first)'
    );
    expect(GET_ACCURACY_LEADERBOARD).toContain('accuracy');
    expect(GET_ACCURACY_LEADERBOARD).not.toContain('accuracyLeaderboard');
    // v1 Brier components are gone from the v2 surface.
    expect(GET_ACCURACY_LEADERBOARD).not.toContain('numScored');
    expect(GET_ACCURACY_LEADERBOARD).not.toContain('sumErrorSquared');
  });

  test('uses default limit of 10', async () => {
    mockGraphqlRequest.mockResolvedValue({ leaderboard: { edges: [] } });
    await fetchAccuracyLeaderboard();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_ACCURACY_LEADERBOARD, {
      first: 10,
    });
  });

  test('passes custom limit', async () => {
    mockGraphqlRequest.mockResolvedValue({ leaderboard: { edges: [] } });
    await fetchAccuracyLeaderboard(25);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_ACCURACY_LEADERBOARD, {
      first: 25,
    });
  });

  test('maps edges to slim { address, rank, accuracyScore } rows (accuracy is 0-1)', async () => {
    mockGraphqlRequest.mockResolvedValue({
      leaderboard: {
        edges: [
          { node: { rank: 1, accuracy: 0.92, account: { address: '0xa' } } },
          { node: { rank: 2, accuracy: 0.87, account: { address: '0xb' } } },
        ],
      },
    });

    const result = await fetchAccuracyLeaderboard(2);
    expect(result).toEqual([
      { address: '0xa', rank: 1, accuracyScore: 0.92 },
      { address: '0xb', rank: 2, accuracyScore: 0.87 },
    ]);
    expect(Object.keys(result[0]).sort()).toEqual([
      'accuracyScore',
      'address',
      'rank',
    ]);
  });

  test('defaults accuracyScore to 0 when node accuracy is null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      leaderboard: {
        edges: [
          { node: { rank: 1, accuracy: null, account: { address: '0xa' } } },
        ],
      },
    });

    const result = await fetchAccuracyLeaderboard(1);
    expect(result[0].accuracyScore).toBe(0);
  });

  test('returns empty array when no data', async () => {
    mockGraphqlRequest.mockResolvedValue({ leaderboard: null });
    const result = await fetchAccuracyLeaderboard();
    expect(result).toEqual([]);
  });
});

// ============================================================================
// fetchForecasterRank — v2 account.ranking(ACCURACY) + count-only leaderboard
// ============================================================================

describe('fetchForecasterRank', () => {
  test('queries account ranking plus count-only ACCURACY leaderboard', () => {
    expect(GET_FORECASTER_RANK).toContain('ranking(metric: ACCURACY)');
    expect(GET_FORECASTER_RANK).toContain(
      'leaderboard(metric: ACCURACY, first: 0)'
    );
    expect(GET_FORECASTER_RANK).toContain('totalCount');
    expect(GET_FORECASTER_RANK).not.toContain('accountAccuracyRank');
  });

  test('lowercases address before sending', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 5, accuracy: 0.85 } },
      leaderboard: { totalCount: 100 },
    });

    await fetchForecasterRank('0xAbCdEf1234567890');
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].address).toBe('0xabcdef1234567890');
  });

  test('returns rank data when ranked', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 5, accuracy: 0.85 } },
      leaderboard: { totalCount: 100 },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result).toEqual({
      accuracyScore: 0.85,
      rank: 5,
      totalForecasters: 100,
    });
  });

  test('returns nulls when unranked (ranking is null)', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: null },
      leaderboard: { totalCount: 42 },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result).toEqual({
      accuracyScore: null,
      rank: null,
      totalForecasters: 42,
    });
  });

  test('defaults accuracyScore to 0 when ranked with null accuracy', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 3, accuracy: null } },
      leaderboard: { totalCount: 50 },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result.accuracyScore).toBe(0);
    expect(result.rank).toBe(3);
  });

  test('defaults totalForecasters to 0 when count is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 1, accuracy: 0.5 } },
      leaderboard: null,
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result.totalForecasters).toBe(0);
  });
});

// ============================================================================
// fetchUserProfitRank — v2 account.ranking(PNL); rank is over the FULL
// ranked population now, not the client-sorted top 100 of v1.
// ============================================================================

describe('fetchUserProfitRank', () => {
  test('queries account ranking plus count-only PNL leaderboard', () => {
    expect(GET_USER_PROFIT_RANK).toContain('ranking(metric: PNL)');
    expect(GET_USER_PROFIT_RANK).toContain(
      'leaderboard(metric: PNL, first: 0)'
    );
    expect(GET_USER_PROFIT_RANK).toContain('pnlFormatted');
    expect(GET_USER_PROFIT_RANK).not.toContain('profitLeaderboard');
  });

  test('lowercases address before sending', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 1, pnlFormatted: '10' } },
      leaderboard: { totalCount: 4 },
    });

    await fetchUserProfitRank('0xBoB');
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].address).toBe('0xbob');
  });

  test('returns server-computed rank, pnl and full participant count', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: { rank: 137, pnlFormatted: '500.25' } },
      leaderboard: { totalCount: 5000 },
    });

    const result = await fetchUserProfitRank('0xalice');
    // Rank 137 with 5000 participants was impossible under v1's
    // client-side top-100 sort — the rank is now over the full population.
    expect(result).toEqual({
      totalPnL: '500.25',
      rank: 137,
      totalParticipants: 5000,
    });
  });

  test('returns null rank and zero pnl when unranked', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: { ranking: null },
      leaderboard: { totalCount: 4 },
    });

    const result = await fetchUserProfitRank('0xUnknown');
    expect(result.rank).toBeNull();
    expect(result.totalPnL).toBe('0');
    expect(result.totalParticipants).toBe(4);
  });

  test('handles missing account and count gracefully', async () => {
    mockGraphqlRequest.mockResolvedValue({
      account: null,
      leaderboard: null,
    });

    const result = await fetchUserProfitRank('0xAny');
    expect(result).toEqual({ totalPnL: '0', rank: null, totalParticipants: 0 });
  });
});
