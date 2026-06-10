import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchLeaderboard,
  fetchAccuracyLeaderboard,
  fetchForecasterRank,
  fetchUserProfitRank,
} from '../leaderboard';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// fetchLeaderboard
// ============================================================================

describe('fetchLeaderboard', () => {
  test('returns top 100 entries', async () => {
    const entries = Array.from({ length: 150 }, (_, i) => ({
      address: `0x${i.toString(16).padStart(40, '0')}`,
      totalPnL: `${i}`,
    }));
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: entries });

    const result = await fetchLeaderboard();
    expect(result).toHaveLength(100);
  });

  test('returns empty array when no data', async () => {
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: null });
    const result = await fetchLeaderboard();
    expect(result).toEqual([]);
  });

  test('returns all entries when fewer than 100', async () => {
    const entries = [
      { address: '0xabc', totalPnL: '100' },
      { address: '0xdef', totalPnL: '50' },
    ];
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: entries });

    const result = await fetchLeaderboard();
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// fetchAccuracyLeaderboard
// ============================================================================

describe('fetchAccuracyLeaderboard', () => {
  test('uses default limit of 10', async () => {
    mockGraphqlRequest.mockResolvedValue({ accuracyLeaderboard: [] });
    await fetchAccuracyLeaderboard();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      limit: 10,
    });
  });

  test('passes custom limit', async () => {
    mockGraphqlRequest.mockResolvedValue({ accuracyLeaderboard: [] });
    await fetchAccuracyLeaderboard(25);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      limit: 25,
    });
  });

  test('returns empty array when no data', async () => {
    mockGraphqlRequest.mockResolvedValue({ accuracyLeaderboard: null });
    const result = await fetchAccuracyLeaderboard();
    expect(result).toEqual([]);
  });
});

// ============================================================================
// fetchForecasterRank
// ============================================================================

describe('fetchForecasterRank', () => {
  test('lowercases address before sending', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        accuracyScore: 0.85,
        rank: 5,
        totalForecasters: 100,
      },
    });

    await fetchForecasterRank('0xAbCdEf1234567890');
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].address).toBe('0xabcdef1234567890');
  });

  test('returns rank data when found', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        accuracyScore: 0.85,
        rank: 5,
        totalForecasters: 100,
      },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result).toEqual({
      accuracyScore: 0.85,
      rank: 5,
      totalForecasters: 100,
    });
  });

  test('returns nulls when rank data is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({ accountAccuracyRank: null });
    const result = await fetchForecasterRank('0xabc');
    expect(result).toEqual({
      accuracyScore: null,
      rank: null,
      totalForecasters: 0,
    });
  });

  test('defaults accuracyScore to 0 when null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        accuracyScore: null,
        rank: 3,
        totalForecasters: 50,
      },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result.accuracyScore).toBe(0);
  });

  test('defaults totalForecasters to 0 when null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        accuracyScore: 0.5,
        rank: 1,
        totalForecasters: null,
      },
    });

    const result = await fetchForecasterRank('0xabc');
    expect(result.totalForecasters).toBe(0);
  });
});

// ============================================================================
// fetchUserProfitRank
// ============================================================================

describe('fetchUserProfitRank', () => {
  const leaderboardEntries = [
    { address: '0xAlice', totalPnL: '500' },
    { address: '0xBob', totalPnL: '1000' },
    { address: '0xCharlie', totalPnL: '200' },
    { address: '0xDave', totalPnL: '750' },
  ];

  test('sorts entries by totalPnL descending and assigns rank', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: leaderboardEntries,
    });

    const result = await fetchUserProfitRank('0xBob');
    // Sorted: Bob(1000), Dave(750), Alice(500), Charlie(200)
    expect(result.rank).toBe(1);
    expect(result.totalPnL).toBe('1000');
    expect(result.totalParticipants).toBe(4);
  });

  test('calculates correct rank for middle entry', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: leaderboardEntries,
    });

    const result = await fetchUserProfitRank('0xAlice');
    // Sorted: Bob(1000), Dave(750), Alice(500), Charlie(200) → rank 3
    expect(result.rank).toBe(3);
    expect(result.totalPnL).toBe('500');
  });

  test('calculates correct rank for last entry', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: leaderboardEntries,
    });

    const result = await fetchUserProfitRank('0xCharlie');
    expect(result.rank).toBe(4);
  });

  test('returns null rank when user not found', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: leaderboardEntries,
    });

    const result = await fetchUserProfitRank('0xUnknown');
    expect(result.rank).toBeNull();
    expect(result.totalPnL).toBe('0');
    expect(result.totalParticipants).toBe(4);
  });

  test('case-insensitive address matching', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: [{ address: '0xAbCdEf', totalPnL: '100' }],
    });

    const result = await fetchUserProfitRank('0xABCDEF');
    expect(result.rank).toBe(1);
    expect(result.totalPnL).toBe('100');
  });

  test('handles empty leaderboard', async () => {
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: [] });

    const result = await fetchUserProfitRank('0xAny');
    expect(result.rank).toBeNull();
    expect(result.totalPnL).toBe('0');
    expect(result.totalParticipants).toBe(0);
  });

  test('handles null leaderboard response', async () => {
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: null });

    const result = await fetchUserProfitRank('0xAny');
    expect(result.rank).toBeNull();
    expect(result.totalPnL).toBe('0');
    expect(result.totalParticipants).toBe(0);
  });

  test('sorts string PnL values numerically, not lexicographically', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: [
        { address: '0xA', totalPnL: '9' },
        { address: '0xB', totalPnL: '100' },
        { address: '0xC', totalPnL: '20' },
      ],
    });

    // Numeric sort: 100, 20, 9
    const resultB = await fetchUserProfitRank('0xB');
    expect(resultB.rank).toBe(1);

    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: [
        { address: '0xA', totalPnL: '9' },
        { address: '0xB', totalPnL: '100' },
        { address: '0xC', totalPnL: '20' },
      ],
    });

    const resultA = await fetchUserProfitRank('0xA');
    expect(resultA.rank).toBe(3);
  });

  test('handles negative PnL values', async () => {
    mockGraphqlRequest.mockResolvedValue({
      profitLeaderboard: [
        { address: '0xA', totalPnL: '-50' },
        { address: '0xB', totalPnL: '100' },
        { address: '0xC', totalPnL: '-10' },
      ],
    });

    // Sorted: B(100), C(-10), A(-50)
    const result = await fetchUserProfitRank('0xA');
    expect(result.rank).toBe(3);
    expect(result.totalPnL).toBe('-50');
  });

  test('requests limit of 100', async () => {
    mockGraphqlRequest.mockResolvedValue({ profitLeaderboard: [] });
    await fetchUserProfitRank('0xAny');
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1]).toEqual({ limit: 100 });
  });
});
