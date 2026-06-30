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
  }
) => ({
  vault: { statsHistory: { nodes, pageInfo } },
});

describe('GET_VAULT_STATS document', () => {
  test('queries vault(address, chainId).statsHistory with the expected fields', () => {
    expect(GET_VAULT_STATS).toContain(
      'vault(address: $address, chainId: $chainId)'
    );
    // `first` is a nullable variable: omitting it lets the resolver return up
    // to its MAX_STATS_POINTS cap in one page, while `pageInfo`/`after` keep a
    // pagination fallback for any vault that exceeds the cap.
    expect(GET_VAULT_STATS).toContain(
      'statsHistory(first: $first, after: $after)'
    );
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

  test('pages on `pageInfo` when a vault exceeds the server cap', async () => {
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
    await fetchVaultStats('0xabc', 42161, 100);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_VAULT_STATS, {
      address: '0xabc',
      chainId: 42161,
      first: 100,
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
