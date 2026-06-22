import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfiguredVaults = vi.fn();
const mockGetProtocolStatsTimeSeries = vi.fn();

vi.mock('../../../../services/protocolStats', () => ({
  getConfiguredVaults: mockGetConfiguredVaults,
  getProtocolStatsTimeSeries: mockGetProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds: vi.fn(() => 86400),
  computeAirdropResidual: vi.fn(() => 0n),
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

const { protocolStats, __clearProtocolStatsCache } = await import(
  './analytics'
);

type ProtocolStatsFn = (
  parent: unknown,
  args: { vaultAddress?: string | null },
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
const protocolStatsFn = protocolStats as unknown as ProtocolStatsFn;

const PROTOCOL_VAULT = {
  kind: 'protocol',
  address: '0xprotocol',
  config: { address: '0xprotocol', legacy: [] },
};

describe('Query.protocolStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearProtocolStatsCache();
    mockGetConfiguredVaults.mockReturnValue([PROTOCOL_VAULT]);
  });

  it('returns [] for an unknown vaultAddress instead of falling back to all vaults', async () => {
    const result = await protocolStatsFn(
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
    vi.mocked(svc.calculateVaultUnredeemedClaim).mockResolvedValue(988n);

    const result = (await protocolStatsFn(
      {} as never,
      { vaultAddress: null },
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

describe('Query.protocolStats TTL cache', () => {
  // Minimal happy-path mocks so a full compute can run end to end. The series
  // SQL is mocked to [] (its correctness is covered by the integration test);
  // here we only care how many times the underlying work is triggered.
  const primeMocks = async () => {
    mockGetConfiguredVaults.mockReturnValue([PROTOCOL_VAULT]);
    mockGetProtocolStatsTimeSeries.mockResolvedValue([
      {
        vaultAddress: '0xprotocol',
        timestamp: 1_000_000,
        vaultBalance: '0',
        vaultAvailableAssets: '0',
        vaultDeployed: '0',
        escrowBalance: '0',
        vaultPositionsWon: 0,
        vaultPositionsLost: 0,
        vaultDeposits: '0',
        vaultWithdrawals: '0',
        vaultAirdropGains: '0',
        vaultRealizedPnL: '0',
        vaultUnredeemedClaim: '0',
        vaultSecondaryBought: '0',
        vaultSecondarySold: '0',
      },
    ]);
    mockQueryRaw.mockResolvedValue([]);
    const svc = await import('../../../../services/protocolStats');
    vi.mocked(svc.fetchVaultTVL).mockResolvedValue(0n);
    vi.mocked(svc.fetchVaultAvailableAssets).mockResolvedValue(0n);
    vi.mocked(svc.fetchVaultDeployed).mockResolvedValue(0n);
    vi.mocked(svc.sumEscrowBalancesAtBlock).mockResolvedValue(0n);
    vi.mocked(svc.calculateVaultPnL).mockResolvedValue({
      realizedPnL: 0n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 0n,
    });
    vi.mocked(svc.calculateVaultFlows).mockResolvedValue({
      totalDeposits: 0n,
      totalWithdrawals: 0n,
    });
    vi.mocked(svc.calculateVaultSecondaryFlows).mockResolvedValue({
      bought: 0n,
      sold: 0n,
    });
    vi.mocked(svc.calculateVaultUnredeemedClaim).mockResolvedValue(0n);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    __clearProtocolStatsCache();
    await primeMocks();
  });

  const call = () =>
    protocolStatsFn(
      {} as never,
      { vaultAddress: null },
      {} as never,
      {} as never
    );

  it('computes once and serves cached result on repeat calls within the TTL', async () => {
    await call();
    await call();
    await call();

    // The 3 series queries run on the first call only; later calls are cached.
    expect(mockQueryRaw).toHaveBeenCalledTimes(3);
    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent calls into one computation', async () => {
    await Promise.all([call(), call(), call(), call()]);

    // The dashboard's concurrent `stats` + `statsHistory` resolvers (and any
    // overlapping refetch) collapse to a single DB+RPC pass.
    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw).toHaveBeenCalledTimes(3);
  });

  it('re-computes after the cache is cleared (TTL expiry)', async () => {
    await call();
    __clearProtocolStatsCache();
    await call();

    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by vault address — a different vault is not a cache hit', async () => {
    mockGetConfiguredVaults.mockReturnValue([
      PROTOCOL_VAULT,
      {
        kind: 'pyth',
        address: '0xpyth',
        config: { address: '0xpyth', legacy: [] },
      },
    ]);

    await call();
    await protocolStatsFn(
      {} as never,
      { vaultAddress: '0xpyth' },
      {} as never,
      {} as never
    );

    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected computation', async () => {
    mockGetProtocolStatsTimeSeries.mockRejectedValueOnce(new Error('db down'));

    await expect(call()).rejects.toThrow('db down');
    // Next call must retry rather than replay the cached rejection.
    const result = await call();

    expect(Array.isArray(result)).toBe(true);
    expect(mockGetProtocolStatsTimeSeries).toHaveBeenCalledTimes(2);
  });
});
