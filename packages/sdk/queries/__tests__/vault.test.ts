import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchVaultAccountValue,
  fetchVaultStats,
  GET_VAULT_ACCOUNT_VALUE,
  GET_VAULT_STATS,
} from '../vault';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const node = (timestamp: number, overrides: Record<string, unknown> = {}) => ({
  timestamp,
  balance: '1000',
  deployedCollateral: '500',
  undeployedCollateral: '300',
  cumulativePnl: '42',
  claimableCollateral: '10',
  ...overrides,
});

const responseWith = (
  nodes: ReturnType<typeof node>[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
  totalCount?: number
) => ({
  vault: {
    statsHistory: {
      nodes,
      ...(totalCount !== undefined ? { totalCount } : {}),
      pageInfo,
    },
  },
});

// Inverse of the fetcher's synthesized offset cursor: the start offset a
// given `after` value asks the server to begin at (k + 1), 0 when null.
const startFromAfter = (after: string | null): number => {
  if (!after) return 0;
  const b64 = after.replace(/-/g, '+').replace(/_/g, '/');
  const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  return Number(parsed.k) + 1;
};

describe('GET_VAULT_STATS document', () => {
  test('queries vault(address, chainId).statsHistory with the expected fields', () => {
    expect(GET_VAULT_STATS).toContain(
      'vault(address: $address, chainId: $chainId)'
    );
    // `first` is a nullable variable: omitting it lets the resolver return
    // its default page size, while `totalCount`/`pageInfo`/`after` let the
    // fetcher plan newest-first offset jumps across a multi-page series.
    expect(GET_VAULT_STATS).toContain(
      'statsHistory(first: $first, after: $after)'
    );
    expect(GET_VAULT_STATS).toContain('totalCount');
    expect(GET_VAULT_STATS).toContain('hasNextPage');
    expect(GET_VAULT_STATS).toContain('endCursor');
    expect(GET_VAULT_STATS).toContain('timestamp');
    expect(GET_VAULT_STATS).toContain('balance');
    expect(GET_VAULT_STATS).toContain('deployedCollateral');
    expect(GET_VAULT_STATS).toContain('undeployedCollateral');
    expect(GET_VAULT_STATS).toContain('cumulativePnl');
    expect(GET_VAULT_STATS).toContain('claimableCollateral');
    // Stale field names must not leak into the query.
    expect(GET_VAULT_STATS).not.toContain('vaultBalance');
    expect(GET_VAULT_STATS).not.toContain('escrowBalance');
    expect(GET_VAULT_STATS).not.toContain('vaultCumulativePnL');
  });
});

describe('fetchVaultStats', () => {
  test('single request (no pageSize) sends a null `first`, address lowercased', async () => {
    mockGraphqlRequest.mockResolvedValue(responseWith([node(1700000100)]));
    await fetchVaultStats('0xABCDEF', 42161);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_VAULT_STATS, {
      address: '0xabcdef',
      chainId: 42161,
      first: null,
      after: null,
    });
  });

  test('one request returns the bounded series when the server signals no next page', async () => {
    mockGraphqlRequest.mockResolvedValue(
      responseWith([node(1700000300), node(1700000200), node(1700000100)])
    );

    const result = await fetchVaultStats('0xabc', 42161);

    // Single round-trip: the resolver's cap covers the whole series.
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    // All snapshots accumulated, sorted oldest-first.
    expect(result.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000200, 1700000300,
    ]);
  });

  test('falls back to a forward endCursor walk when the server omits totalCount', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(
        responseWith([node(1700000300), node(1700000200)], {
          hasNextPage: true,
          endCursor: 'cursor-1',
        })
      )
      .mockResolvedValueOnce(
        responseWith([node(1700000100)], {
          hasNextPage: false,
          endCursor: null,
        })
      );

    const result = await fetchVaultStats('0xabc', 42161);

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    // Second page threads the first page's endCursor as `after`.
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      after: 'cursor-1',
    });
    expect(result.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000200, 1700000300,
    ]);
  });

  test('forwards an explicit pageSize as the per-page `first`', async () => {
    mockGraphqlRequest.mockResolvedValue(responseWith([node(1700000100)]));
    await fetchVaultStats('0xabc', 42161, { pageSize: 25 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_VAULT_STATS, {
      address: '0xabc',
      chainId: 42161,
      first: 25,
      after: null,
    });
  });

  test('maps wire nodes to the adapted vault stat shape', async () => {
    mockGraphqlRequest.mockResolvedValue(
      responseWith([node(1700000100), node(1700000200)])
    );
    const result = await fetchVaultStats('0xabc', 42161);
    expect(result).toEqual([
      {
        timestamp: 1700000100,
        balance: '1000',
        deployedCollateral: '500',
        undeployedCollateral: '300',
        cumulativePnl: '42',
        claimableCollateral: '10',
      },
      {
        timestamp: 1700000200,
        balance: '1000',
        deployedCollateral: '500',
        undeployedCollateral: '300',
        cumulativePnl: '42',
        claimableCollateral: '10',
      },
    ]);
  });

  test('sorts snapshots oldest-first (statsHistory defaults to DESC)', async () => {
    mockGraphqlRequest.mockResolvedValue(
      responseWith([node(1700000200), node(1700000100), node(1700000150)])
    );
    const result = await fetchVaultStats('0xabc', 42161);
    expect(result.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000150, 1700000200,
    ]);
  });

  test('normalizes BigInt-scalar wire values (number or string) to decimal strings', async () => {
    mockGraphqlRequest.mockResolvedValue(
      responseWith([
        node(1700000100, {
          balance: 1000,
          deployedCollateral: 500,
          undeployedCollateral: 300,
          cumulativePnl: 42,
          claimableCollateral: 10,
        }),
      ])
    );
    const result = await fetchVaultStats('0xabc', 42161);
    expect(result[0].balance).toBe('1000');
    expect(result[0].deployedCollateral).toBe('500');
    expect(result[0].claimableCollateral).toBe('10');
  });

  test('returns an empty array when the vault is unknown (null vault)', async () => {
    mockGraphqlRequest.mockResolvedValue({ vault: null });
    expect(await fetchVaultStats('0xabc', 42161)).toEqual([]);
    mockGraphqlRequest.mockResolvedValue(null);
    expect(await fetchVaultStats('0xabc', 42161)).toEqual([]);
  });

  // ── Newest-first multi-page walk ──────────────────────────────────────────
  //
  // Simulated server: 20 snapshots (offset i → timestamp ts(i)), page size 3.
  // The head request returns the oldest page + totalCount; the fetcher then
  // jumps to the tail via synthesized offset cursors, newest chunk first.
  const ts = (offset: number) => 1700000000 + offset * 100;

  const mockOffsetServer = (total: number, stride: number) => {
    mockGraphqlRequest.mockImplementation(
      async (_doc: unknown, vars: { after: string | null }) => {
        const start = startFromAfter(vars.after);
        const rows = [];
        for (let i = start; i < Math.min(start + stride, total); i += 1) {
          rows.push(node(ts(i)));
        }
        return responseWith(
          rows,
          {
            hasNextPage: start + stride < total,
            endCursor: rows.length ? `end-${start + rows.length - 1}` : null,
          },
          total
        );
      }
    );
  };

  test('loads a long series newest-first, streaming contiguous progress', async () => {
    mockOffsetServer(20, 3);
    const emissions: number[][] = [];

    const result = await fetchVaultStats('0xabc', 42161, {
      onProgress: (stats) => emissions.push(stats.map((s) => s.timestamp)),
    });

    // 1 head request + 6 tail chunks (offsets 18,15,12,9 then 6,3).
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(7);
    const starts = mockGraphqlRequest.mock.calls.map((c) =>
      startFromAfter((c[1] as { after: string | null }).after)
    );
    expect(starts).toEqual([0, 18, 15, 12, 9, 6, 3]);

    // Progress is contiguous from the newest snapshot backward: first batch
    // covers offsets 9..19, second closes the gap down to the head page.
    expect(emissions).toHaveLength(2);
    expect(emissions[0]).toEqual(
      Array.from({ length: 11 }, (_, i) => ts(9 + i))
    );
    expect(emissions[1]).toEqual(Array.from({ length: 20 }, (_, i) => ts(i)));

    expect(result.map((s) => s.timestamp)).toEqual(
      Array.from({ length: 20 }, (_, i) => ts(i))
    );
  });

  test('maxPages drops the OLDEST pages, never the newest', async () => {
    mockOffsetServer(20, 3);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Budget: 1 head + 2 tail chunks → offsets 18 and 15 only.
    const result = await fetchVaultStats('0xabc', 42161, { maxPages: 3 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    // Only the newest 5 snapshots survive; the head page's oldest rows are
    // excluded too (they would leave a hole in the middle of the series).
    expect(result.map((s) => s.timestamp)).toEqual(
      Array.from({ length: 5 }, (_, i) => ts(15 + i))
    );
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test('with a baseline, refetches only the tail: last known row + appended rows', async () => {
    const baseline = Array.from({ length: 5 }, (_, i) => ({
      timestamp: ts(i),
      balance: '1000',
      deployedCollateral: '500',
      undeployedCollateral: '300',
      cumulativePnl: '42',
      claimableCollateral: '10',
    }));
    // The server rewrote the last known bucket (balance 1000 → 9999) and
    // appended one new snapshot after it.
    mockGraphqlRequest.mockResolvedValue(
      responseWith([node(ts(4), { balance: '9999' }), node(ts(5))], {
        hasNextPage: false,
        endCursor: null,
      })
    );

    const result = await fetchVaultStats('0xabc', 42161, { baseline });

    // A single request, starting at the baseline's last row (offset 4).
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(
      startFromAfter(
        (mockGraphqlRequest.mock.calls[0][1] as { after: string | null }).after
      )
    ).toBe(4);

    expect(result.map((s) => s.timestamp)).toEqual(
      Array.from({ length: 6 }, (_, i) => ts(i))
    );
    // The rewritten bucket's values replace the stale baseline row.
    expect(result[4].balance).toBe('9999');
  });
});

describe('GET_VAULT_ACCOUNT_VALUE document', () => {
  test('reads the live vault `stats` snapshot, not the account surface', () => {
    // Must source from the vault entity: its `deployedCollateral` is keyed off
    // Picks.resolved/resolvedAt, so resolved-but-unsettled (losing) positions
    // drop out. The `account(...)` surface keys deployed off Prediction.settledAt
    // — losing predictions are never settled on-chain, so they stay counted as
    // deployed forever and inflate the balance. Regression guard for that.
    expect(GET_VAULT_ACCOUNT_VALUE).toContain(
      'vault(address: $address, chainId: $chainId)'
    );
    expect(GET_VAULT_ACCOUNT_VALUE).not.toContain('account(');
    expect(GET_VAULT_ACCOUNT_VALUE).toContain('stats {');
    expect(GET_VAULT_ACCOUNT_VALUE).toContain('balance');
    expect(GET_VAULT_ACCOUNT_VALUE).toContain('deployedCollateral');
    expect(GET_VAULT_ACCOUNT_VALUE).toContain('claimableCollateral');
  });
});

describe('fetchVaultAccountValue', () => {
  test('lowercases the address and sums vault balance, deployed, and claimable collateral', async () => {
    mockGraphqlRequest.mockResolvedValue({
      vault: {
        stats: {
          timestamp: 1700000100,
          balance: '1000',
          deployedCollateral: '500',
          claimableCollateral: '125',
        },
      },
    });

    const result = await fetchVaultAccountValue('0xABCDEF', 42161);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_VAULT_ACCOUNT_VALUE, {
      address: '0xabcdef',
      chainId: 42161,
    });
    expect(result).toEqual({
      collateralBalance: '1000',
      deployedCollateral: '500',
      claimableCollateral: '125',
      totalValue: '1625',
      timestamp: 1700000100,
    });
  });

  test('defaults to zeros when the vault has no stats snapshot yet', async () => {
    mockGraphqlRequest.mockResolvedValue({
      vault: { stats: null },
    });

    await expect(fetchVaultAccountValue('0xabc', 42161)).resolves.toEqual({
      collateralBalance: '0',
      deployedCollateral: '0',
      claimableCollateral: '0',
      totalValue: '0',
      timestamp: null,
    });
  });

  test('defaults to zeros when the address is not a configured vault', async () => {
    mockGraphqlRequest.mockResolvedValue({ vault: null });

    await expect(fetchVaultAccountValue('0xabc', 42161)).resolves.toEqual({
      collateralBalance: '0',
      deployedCollateral: '0',
      claimableCollateral: '0',
      totalValue: '0',
      timestamp: null,
    });
  });
});
