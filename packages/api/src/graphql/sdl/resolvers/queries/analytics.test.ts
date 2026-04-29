import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfiguredVaults = vi.fn();
const mockGetProtocolStatsTimeSeries = vi.fn();

vi.mock('../../../../services/protocolStats', () => ({
  getConfiguredVaults: mockGetConfiguredVaults,
  getProtocolStatsTimeSeries: mockGetProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds: vi.fn(() => 86400),
  calculateVaultAirdrops: vi.fn(),
  calculateVaultFlows: vi.fn(),
  calculateVaultPnL: vi.fn(),
  calculateVaultSecondaryFlows: vi.fn(),
  calculateVaultUnredeemedClaim: vi.fn(),
  fetchVaultAvailableAssets: vi.fn(),
  fetchVaultDeployed: vi.fn(),
  fetchVaultTVL: vi.fn(),
  sumEscrowBalancesAtBlock: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../../../../lib/utils', () => ({
  getProviderForChain: vi.fn(),
}));

const { protocolStats } = await import('./analytics');

describe('Query.protocolStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfiguredVaults.mockReturnValue([
      {
        kind: 'protocol',
        address: '0xprotocol',
        config: {
          address: '0xprotocol',
          legacy: [],
        },
      },
    ]);
  });

  it('returns [] for an unknown vaultAddress instead of falling back to all vaults', async () => {
    const result = await protocolStats(
      {} as never,
      { vaultAddress: '0xdeadbeef' },
      {} as never,
      {} as never
    );

    expect(result).toEqual([]);
    expect(mockGetProtocolStatsTimeSeries).not.toHaveBeenCalled();
  });
});
