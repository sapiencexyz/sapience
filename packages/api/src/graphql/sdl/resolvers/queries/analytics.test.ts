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

const mockQueryRaw = vi.fn();
vi.mock('../../../../core/db', () => ({
  default: {
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock('../../../../lib/utils', () => ({
  getProviderForChain: vi.fn(),
}));

const { vaultStats } = await import('./analytics');

type VaultStatsFn = (
  parent: unknown,
  args: { vaultAddress: string },
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

  it('rolls vaultUnredeemedClaim into vaultCumulativePnL for snapshots and the live candle', async () => {
    // A snapshot captured the instant a chunk of the vault's positions
    // resolved but before the keeper's redeem tx was indexed: realized PnL is
    // deeply negative (cost recognized, payout not), yet the wUSDe is already
    // earmarked for the vault in `vaultUnredeemedClaim`. The chart must net the
    // two so the line doesn't show a phantom loss.
    const baseSnapshot = {
      vaultAddress: '0xprotocol',
      vaultBalance: '0',
      vaultAvailableAssets: '0',
      vaultDeployed: '0',
      escrowBalance: '0',
      vaultPositionsWon: 0,
      vaultPositionsLost: 0,
      vaultDeposits: '0',
      vaultWithdrawals: '0',
      vaultAirdropGains: '0',
    };
    mockGetProtocolStatsTimeSeries.mockResolvedValue([
      {
        ...baseSnapshot,
        timestamp: 1_000_000,
        vaultRealizedPnL: '100',
        vaultUnredeemedClaim: '0',
        vaultSecondaryBought: '0',
        vaultSecondarySold: '0',
      },
      {
        ...baseSnapshot,
        timestamp: 1_000_000 + 86_400,
        vaultRealizedPnL: '-970', // cost booked at resolution
        vaultUnredeemedClaim: '988', // payout earmarked, redeem not yet indexed
        vaultSecondaryBought: '5',
        vaultSecondarySold: '7',
      },
    ]);
    mockQueryRaw.mockResolvedValue([]);

    const svc = await import('../../../../services/protocolStats');
    vi.mocked(svc.fetchVaultTVL).mockResolvedValue(0n);
    vi.mocked(svc.fetchVaultAvailableAssets).mockResolvedValue(0n);
    vi.mocked(svc.fetchVaultDeployed).mockResolvedValue(0n);
    vi.mocked(svc.sumEscrowBalancesAtBlock).mockResolvedValue(0n);
    vi.mocked(svc.calculateVaultPnL).mockResolvedValue({
      realizedPnL: -970n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 970n,
    });
    vi.mocked(svc.calculateVaultFlows).mockResolvedValue({
      totalDeposits: 0n,
      totalWithdrawals: 0n,
    });
    vi.mocked(svc.calculateVaultSecondaryFlows).mockResolvedValue({
      bought: 5n,
      sold: 7n,
    });
    vi.mocked(svc.calculateVaultAirdrops).mockResolvedValue(0n);
    vi.mocked(svc.calculateVaultUnredeemedClaim).mockResolvedValue(988n);

    const result = (await vaultStatsFn(
      {} as never,
      { vaultAddress: '0xprotocol' },
      {} as never,
      {} as never
    )) as Array<{ vaultCumulativePnL: string; periodPnL: string }>;

    // 2 persisted snapshots + 1 live candle.
    expect(result).toHaveLength(3);
    // Snapshot 0: 100 + 0 + 0 - 0
    expect(result[0].vaultCumulativePnL).toBe('100');
    // Snapshot 1: -970 + 988 + 7 - 5 = 20
    expect(result[1].vaultCumulativePnL).toBe('20');
    // Period PnL between the two snapshots: 20 - 100 = -80
    expect(result[1].periodPnL).toBe('-80');
    // Live candle: realizedPnL(-970) + unredeemed(988) + sold(7) - bought(5) = 20
    expect(result[2].vaultCumulativePnL).toBe('20');
  });
});
