import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchAccuracyLeaderboard,
  fetchAccountAccuracyRank,
  fetchAccountStatsLeaderboard,
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

  test('uses default limit of 25 (mapped to take)', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccuracyLeaderboard();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      take: 25,
      skip: 0,
    });
  });

  test('passes custom limit through as take', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccuracyLeaderboard(50);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      take: 50,
      skip: 0,
    });
  });

  test('returns empty array when no data', async () => {
    mockGraphqlRequest.mockResolvedValue({ accuracyLeaderboardPage: null });
    const result = await fetchAccuracyLeaderboard();
    expect(result).toEqual([]);
  });

  test('forwards AccountAccuracyLeaderboardEntry rows verbatim', async () => {
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
// fetchAccountStatsLeaderboard
// ============================================================================

describe('fetchAccountStatsLeaderboard', () => {
  const row = (address: string, netPnL: string) => ({
    address,
    netPnL,
    gains: '0',
    losses: '0',
    volume: '0',
  });
  const wrap = (items: ReturnType<typeof row>[]) => ({
    accountStatsLeaderboardPage: { items, hasMore: false },
  });

  test('builds the filters input from metric + epoch defaults', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccountStatsLeaderboard({ metric: 'NET_PNL' });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.filters).toEqual({
      metric: 'NET_PNL',
      from: null,
      to: null,
    });
    expect(vars.take).toBe(25);
    expect(vars.skip).toBe(0);
  });

  test('coerces Date inputs to epoch seconds', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await fetchAccountStatsLeaderboard({ metric: 'VOLUME', from, to });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.filters.metric).toBe('VOLUME');
    expect(vars.filters.from).toBe(Math.floor(from.getTime() / 1000));
    expect(vars.filters.to).toBe(Math.floor(to.getTime() / 1000));
  });

  test('passes ISO strings through Date constructor → epoch seconds', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccountStatsLeaderboard({
      metric: 'GAINS',
      from: '2026-03-15T12:00:00Z',
    });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.filters.from).toBe(
      Math.floor(new Date('2026-03-15T12:00:00Z').getTime() / 1000)
    );
    expect(vars.filters.to).toBeNull();
  });

  test('passes numeric epoch seconds through unchanged', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccountStatsLeaderboard({
      metric: 'LOSSES',
      from: 1_700_000_000,
      to: 1_710_000_000,
    });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.filters.from).toBe(1_700_000_000);
    expect(vars.filters.to).toBe(1_710_000_000);
  });

  test('returns the page items array', async () => {
    mockGraphqlRequest.mockResolvedValue(
      wrap([row('0xa', '100'), row('0xb', '50')])
    );
    const result = await fetchAccountStatsLeaderboard({ metric: 'NET_PNL' });
    expect(result.map((r) => r.address)).toEqual(['0xa', '0xb']);
  });

  test('returns empty array on null response', async () => {
    mockGraphqlRequest.mockResolvedValue({ accountStatsLeaderboardPage: null });
    const result = await fetchAccountStatsLeaderboard({ metric: 'NET_PNL' });
    expect(result).toEqual([]);
  });

  test('forwards limit + skip', async () => {
    mockGraphqlRequest.mockResolvedValue(wrap([]));
    await fetchAccountStatsLeaderboard({
      metric: 'NET_PNL',
      limit: 100,
      skip: 50,
    });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.take).toBe(100);
    expect(vars.skip).toBe(50);
  });
});

// ============================================================================
// fetchAccountStatsRank
// ============================================================================

describe('fetchAccountStatsRank', () => {
  test('lowercases address; omits filters entirely when caller provides no metric/window', async () => {
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
    // No filters supplied ⇒ resolver falls through to default NET_PNL / all-time.
    expect(vars.filters).toBeNull();
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
    expect(vars.filters.metric).toBe('VOLUME');
    expect(vars.filters.from).toBe(Math.floor(from.getTime() / 1000));
    expect(vars.filters.to).toBe(Math.floor(to.getTime() / 1000));
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
