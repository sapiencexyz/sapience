import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchLeaderboard,
  fetchUserProfitRank,
  GET_PROFIT_LEADERBOARD,
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
// fetchLeaderboard — leaderboard(metric: PNL)
// ============================================================================

describe('fetchLeaderboard', () => {
  test('queries the PNL leaderboard connection with cursor paging', () => {
    expect(GET_PROFIT_LEADERBOARD).toContain(
      'leaderboard(metric: PNL, first: 25, after: $after)'
    );
    expect(GET_PROFIT_LEADERBOARD).toContain('pnlFormatted');
    expect(GET_PROFIT_LEADERBOARD).toContain('account');
    expect(GET_PROFIT_LEADERBOARD).toContain('address');
    expect(GET_PROFIT_LEADERBOARD).toContain('hasNextPage');
    expect(GET_PROFIT_LEADERBOARD).toContain('endCursor');
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
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_PROFIT_LEADERBOARD, {
      after: null,
    });
  });

  test('loops over cursor pages until hasNextPage is false, concatenating edges', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce({
        leaderboard: {
          edges: [
            {
              node: {
                rank: 1,
                pnlFormatted: '10',
                account: { address: '0xa' },
              },
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        leaderboard: {
          edges: [
            {
              node: { rank: 2, pnlFormatted: '5', account: { address: '0xb' } },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchLeaderboard();
    expect(result).toEqual([
      { address: '0xa', totalPnL: '10' },
      { address: '0xb', totalPnL: '5' },
    ]);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toEqual({ after: null });
    expect(mockGraphqlRequest.mock.calls[1][1]).toEqual({ after: 'cursor-1' });
  });

  test('stops paging once 100 entries are accumulated (bounded to display cap)', async () => {
    const pageEdges = (start: number) =>
      Array.from({ length: 25 }, (_, i) => ({
        node: {
          rank: start + i,
          pnlFormatted: `${start + i}`,
          account: {
            address: `0x${(start + i).toString(16).padStart(40, '0')}`,
          },
        },
      }));
    // Every page reports another page is available; the loop must stop itself
    // once it has >= 100 entries rather than paging unboundedly.
    mockGraphqlRequest.mockImplementation(
      (_doc: unknown, vars: { after: string | null }) => {
        const start = vars.after ? Number(vars.after) : 0;
        return Promise.resolve({
          leaderboard: {
            edges: pageEdges(start),
            pageInfo: { hasNextPage: true, endCursor: String(start + 25) },
          },
        });
      }
    );

    const result = await fetchLeaderboard();
    expect(result).toHaveLength(100);
    // 4 pages * 25 = 100 entries, then the cap stops the loop.
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(4);
  });

  test('stops after one page when hasNextPage is false even with an endCursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      leaderboard: {
        edges: [
          {
            node: { rank: 1, pnlFormatted: '10', account: { address: '0xa' } },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
      },
    });
    const result = await fetchLeaderboard();
    expect(result).toHaveLength(1);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
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
// fetchAccuracyLeaderboard — leaderboard(metric: ACCURACY)
// ============================================================================

// ============================================================================
// fetchForecasterRank — account.ranking(ACCURACY) + count-only leaderboard
// ============================================================================

// ============================================================================
// fetchUserProfitRank — account.ranking(PNL); rank is over the FULL
// ranked population.
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
    // The rank is over the full ranked population, so rank 137 with 5000
    // participants is expected.
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
