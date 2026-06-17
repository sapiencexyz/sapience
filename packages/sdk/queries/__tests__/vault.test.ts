import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchVaultStats, GET_VAULT_STATS } from '../vault';

const mockGraphqlRequestV2 = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
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
  test('queries vault(address, chainId).statsHistory with the v2 fields', () => {
    expect(GET_VAULT_STATS).toContain(
      'vault(address: $address, chainId: $chainId)'
    );
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
    // v1-only field names must not leak into the v2 query.
    expect(GET_VAULT_STATS).not.toContain('vaultBalance');
    expect(GET_VAULT_STATS).not.toContain('escrowBalance');
    expect(GET_VAULT_STATS).not.toContain('vaultCumulativePnL');
  });
});

describe('fetchVaultStats', () => {
  test('passes the address (lowercased), chainId and first page args', async () => {
    mockGraphqlRequestV2.mockResolvedValue(responseWith([node(1700000100)]));
    await fetchVaultStats('0xABCDEF', 42161);
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_VAULT_STATS, {
      address: '0xabcdef',
      chainId: 42161,
      first: 100,
      after: null,
    });
  });

  test('pages through statsHistory until the connection is exhausted', async () => {
    mockGraphqlRequestV2
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

    expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    // Second page threads the first page's endCursor as `after`.
    expect(mockGraphqlRequestV2.mock.calls[1][1]).toMatchObject({
      after: 'cursor-1',
    });
    // All three snapshots accumulated, sorted oldest-first.
    expect(result.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000200, 1700000300,
    ]);
  });

  test('maps wire nodes to the adapted vault stat shape', async () => {
    mockGraphqlRequestV2.mockResolvedValue(
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
    mockGraphqlRequestV2.mockResolvedValue(
      responseWith([node(1700000200), node(1700000100), node(1700000150)])
    );
    const result = await fetchVaultStats('0xabc', 42161);
    expect(result.map((s) => s.timestamp)).toEqual([
      1700000100, 1700000150, 1700000200,
    ]);
  });

  test('normalizes BigInt-scalar wire values (number or string) to decimal strings', async () => {
    mockGraphqlRequestV2.mockResolvedValue(
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
    mockGraphqlRequestV2.mockResolvedValue({ vault: null });
    expect(await fetchVaultStats('0xabc', 42161)).toEqual([]);
    mockGraphqlRequestV2.mockResolvedValue(null);
    expect(await fetchVaultStats('0xabc', 42161)).toEqual([]);
  });
});
