import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  fetchOpenInterestByCategory,
  fetchOpenInterestByTimeToResolution,
  fetchProtocolStats,
  fetchVaultStats,
  GET_OPEN_INTEREST_BY_CATEGORY,
  GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION,
  GET_PROTOCOL_STATS,
  GET_VAULT_STATS,
} from '../analytics';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analytics GraphQL queries', () => {
  test('uses protocol.stats instead of legacy protocolStats root field', async () => {
    expect(GET_PROTOCOL_STATS).toContain('protocol {');
    expect(GET_PROTOCOL_STATS).toContain(
      'stats(filter: { timestamp: { gte: $from, lte: $to } })'
    );
    expect(GET_PROTOCOL_STATS).not.toContain('protocolStats(');

    const nodes = [{ timestamp: 1, cumulativeVolume: '1' }];
    mockGraphqlRequest.mockResolvedValue({ protocol: { stats: { nodes } } });
    await expect(fetchProtocolStats()).resolves.toEqual(nodes);
  });

  test('uses vaultsConnection(filter:{address:}).nodes[0].stats instead of legacy vaultStats root field', async () => {
    expect(GET_VAULT_STATS).toContain(
      'vaultsConnection(filter: { address: $vaultAddress }, first: 1)'
    );
    expect(GET_VAULT_STATS).toContain(
      'stats(filter: { timestamp: { gte: $from, lte: $to } })'
    );
    expect(GET_VAULT_STATS).not.toContain('vaultByAddress(');
    expect(GET_VAULT_STATS).not.toContain('vaultStats(');

    const nodes = [{ timestamp: 1, balance: '1' }];
    mockGraphqlRequest.mockResolvedValue({
      vaultsConnection: { nodes: [{ stats: { nodes } }] },
    });
    await expect(
      fetchVaultStats({
        vaultAddress: '0x0000000000000000000000000000000000000001',
      })
    ).resolves.toEqual(nodes);
  });

  test('vaultsConnection returns empty when no vault matches', async () => {
    mockGraphqlRequest.mockResolvedValue({ vaultsConnection: { nodes: [] } });
    await expect(
      fetchVaultStats({
        vaultAddress: '0x0000000000000000000000000000000000000001',
      })
    ).resolves.toEqual([]);
  });

  test('uses protocol.openInterestByCategory instead of legacy root OI field', async () => {
    expect(GET_OPEN_INTEREST_BY_CATEGORY).toMatch(
      /query OpenInterestByCategory \{\s*protocol \{/
    );
    expect(GET_OPEN_INTEREST_BY_CATEGORY).toContain('openInterestByCategory {');

    const rows = [
      {
        category: { id: 'Q2F0ZWdvcnk6MQ==', name: 'Crypto', slug: 'crypto' },
        openInterest: '1',
      },
    ];
    mockGraphqlRequest.mockResolvedValue({
      protocol: { openInterestByCategory: rows },
    });
    await expect(fetchOpenInterestByCategory()).resolves.toEqual(rows);
  });

  test('uses protocol.openInterestByTimeToResolution instead of legacy root OI field', async () => {
    expect(GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION).toMatch(
      /query OpenInterestByTimeToResolution \{\s*protocol \{/
    );
    expect(GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION).toContain(
      'openInterestByTimeToResolution {'
    );

    const rows = [
      { bucket: 1, label: '≤1d', openInterest: '1', predictionCount: 2 },
    ];
    mockGraphqlRequest.mockResolvedValue({
      protocol: { openInterestByTimeToResolution: rows },
    });
    await expect(fetchOpenInterestByTimeToResolution()).resolves.toEqual(rows);
  });
});
