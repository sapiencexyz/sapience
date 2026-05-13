import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfiguredVaults = vi.fn();
const mockGetProtocolStatsTimeSeries = vi.fn();
const mockGetPriorSnapshot = vi.fn();

vi.mock('../../../../services/protocolStats', () => ({
  getConfiguredVaults: mockGetConfiguredVaults,
  getProtocolStatsTimeSeries: mockGetProtocolStatsTimeSeries,
  getPriorSnapshot: mockGetPriorSnapshot,
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

const { vaultStats } = await import('./analytics');

type VaultStatsFn = (
  parent: unknown,
  args: {
    vaultAddress: string;
    fromEpoch?: number | null;
    toEpoch?: number | null;
  },
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
const vaultStatsFn = vaultStats as unknown as VaultStatsFn;

describe('Query.vaultStats', () => {
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
    const result = await vaultStatsFn(
      {} as never,
      { vaultAddress: '0xdeadbeef' },
      {} as never,
      {} as never
    );

    expect(result).toEqual([]);
    expect(mockGetProtocolStatsTimeSeries).not.toHaveBeenCalled();
  });
});
