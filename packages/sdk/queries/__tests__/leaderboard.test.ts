import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchAccuracyLeaderboard,
  fetchAccountAccuracyRank,
  fetchAccountStatsRank,
} from '../leaderboard';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// fetchAccuracyLeaderboard
// ============================================================================

describe('fetchAccuracyLeaderboard', () => {
  const wrap = (items: Array<{ address: string; accuracyScore: number }>) => ({
    accuracyLeaderboardPage: { items, hasMore: false },
  });

  test('uses default limit of 10 (mapped to take)', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccuracyLeaderboard();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      take: 10,
      skip: 0,
    });
  });

  test('passes custom limit through as take', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccuracyLeaderboard(25);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      take: 25,
      skip: 0,
    });
  });

  test('returns empty array when no data', async () => {
    mockGraphqlRequest.mockResolvedValue({ accuracyLeaderboardPage: null });
    const result = await fetchAccuracyLeaderboard();
    expect(result).toEqual([]);
  });

  test('forwards slimmed ForecasterScore rows verbatim', async () => {
    mockGraphqlRequest.mockResolvedValue(
      wrap([
        { address: '0xa', accuracyScore: 0.9 },
        { address: '0xb', accuracyScore: 0.5 },
      ])
    );
    const result = await fetchAccuracyLeaderboard();
    expect(result).toEqual([
      { address: '0xa', accuracyScore: 0.9 },
      { address: '0xb', accuracyScore: 0.5 },
    ]);
  });
});

// ============================================================================
// fetchAccountAccuracyRank
// ============================================================================

describe('fetchAccountAccuracyRank', () => {
  test('lowercases address before sending', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        address: '0xabcdef1234567890',
        accuracyScore: 0.85,
        rank: 5,
        totalForecasters: 100,
      },
    });

    await fetchAccountAccuracyRank('0xAbCdEf1234567890');
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].address).toBe('0xabcdef1234567890');
  });

  test('returns rank data when found', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountAccuracyRank: {
        address: '0xabc',
        accuracyScore: 0.85,
        rank: 5,
        totalForecasters: 100,
      },
    });

    const result = await fetchAccountAccuracyRank('0xabc');
    expect(result).toEqual({
      address: '0xabc',
      accuracyScore: 0.85,
      rank: 5,
      totalForecasters: 100,
    });
  });

  test('returns zero-stub when rank data is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({ accountAccuracyRank: null });
    const result = await fetchAccountAccuracyRank('0xABC');
    expect(result).toEqual({
      address: '0xabc',
      accuracyScore: 0,
      rank: null,
      totalForecasters: 0,
    });
  });
});

// ============================================================================
// fetchAccountStatsRank
// ============================================================================

describe('fetchAccountStatsRank', () => {
  test('lowercases address and defaults metric to NET_PNL', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountStatsRank: {
        address: '0xabc',
        netPnL: '100',
        gains: '200',
        losses: '-100',
        volume: '500',
        rank: 3,
        totalParticipants: 10,
      },
    });

    await fetchAccountStatsRank({ address: '0xABC' });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.address).toBe('0xabc');
    expect(vars.metric).toBe('NET_PNL');
    expect(vars.fromEpoch).toBeNull();
    expect(vars.toEpoch).toBeNull();
  });

  test('passes explicit metric + Date window as epoch seconds', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountStatsRank: {
        address: '0xabc',
        netPnL: '0',
        gains: '0',
        losses: '0',
        volume: '500',
        rank: 1,
        totalParticipants: 1,
      },
    });

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await fetchAccountStatsRank({
      address: '0xabc',
      metric: 'VOLUME',
      from,
      to,
    });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.metric).toBe('VOLUME');
    expect(vars.fromEpoch).toBe(Math.floor(from.getTime() / 1000));
    expect(vars.toEpoch).toBe(Math.floor(to.getTime() / 1000));
  });

  test('returns zero-stub when resolver returns null', async () => {
    mockGraphqlRequest.mockResolvedValue({ accountStatsRank: null });
    const result = await fetchAccountStatsRank({ address: '0xABC' });
    expect(result).toEqual({
      address: '0xabc',
      netPnL: '0',
      gains: '0',
      losses: '0',
      volume: '0',
      rank: null,
      totalParticipants: 0,
    });
  });

  test('forwards resolver result verbatim', async () => {
    mockGraphqlRequest.mockResolvedValue({
      accountStatsRank: {
        address: '0xabc',
        netPnL: '42',
        gains: '50',
        losses: '-8',
        volume: '1000',
        rank: 2,
        totalParticipants: 4,
      },
    });
    const result = await fetchAccountStatsRank({ address: '0xabc' });
    expect(result).toEqual({
      address: '0xabc',
      netPnL: '42',
      gains: '50',
      losses: '-8',
      volume: '1000',
      rank: 2,
      totalParticipants: 4,
    });
  });
});
