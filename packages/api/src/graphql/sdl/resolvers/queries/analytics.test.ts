import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toGlobalId } from '../../../relay/globalId';

const mockGetConfiguredVaults = vi.fn();
const mockGetProtocolStatsTimeSeries = vi.fn();
const mockGetPriorSnapshot = vi.fn();

vi.mock('../../../../services/protocolStats', () => ({
  getConfiguredVaults: mockGetConfiguredVaults,
  getProtocolStatsTimeSeries: mockGetProtocolStatsTimeSeries,
  getPriorSnapshot: mockGetPriorSnapshot,
  resolveSnapshotIntervalSeconds: vi.fn(() => 86_400),
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

const { protocolStats, vaultStats, vault } = await import('./analytics');

type StatsArgs = {
  fromEpoch?: number | null;
  toEpoch?: number | null;
  vaultAddress?: string;
};
type ResolverFn = (
  parent: unknown,
  args: StatsArgs,
  ctx: unknown,
  info: unknown
) => Promise<Array<Record<string, unknown>>>;
const protocolStatsFn = protocolStats as unknown as ResolverFn;
const vaultStatsFn = vaultStats as unknown as ResolverFn;
const vaultFn = vault as unknown as (
  parent: unknown,
  args: { id: string },
  ctx: unknown,
  info: unknown
) => Promise<Record<string, unknown> | null>;

const PROTOCOL_VAULT = '0xprotocol';

const baseSnapshot = (
  timestamp: number,
  overrides: Record<string, unknown> = {}
) => ({
  vaultAddress: PROTOCOL_VAULT,
  timestamp,
  vaultBalance: '0',
  vaultAvailableAssets: '0',
  vaultDeployed: '0',
  escrowBalance: '0',
  vaultRealizedPnL: '0',
  vaultUnredeemedClaim: '0',
  vaultSecondaryBought: '0',
  vaultSecondarySold: '0',
  vaultPositionsWon: 0,
  vaultPositionsLost: 0,
  vaultDeposits: '0',
  vaultWithdrawals: '0',
  vaultAirdropGains: '0',
  ...overrides,
});

const stubVaultHelpers = async (over: Record<string, unknown> = {}) => {
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
  vi.mocked(svc.calculateVaultAirdrops).mockResolvedValue(0n);
  vi.mocked(svc.calculateVaultUnredeemedClaim).mockResolvedValue(0n);
  Object.assign(svc, over);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfiguredVaults.mockReturnValue([
    {
      kind: 'protocol',
      address: PROTOCOL_VAULT,
      config: { address: PROTOCOL_VAULT, legacy: [] },
    },
  ]);
  mockGetPriorSnapshot.mockResolvedValue(null);
  mockQueryRaw.mockResolvedValue([]);
});

describe('Query.vaultStats', () => {
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

  it('rolls vaultUnredeemedClaim into cumulativePnL for both snapshots and the live candle', async () => {
    // A chunk of the vault's positions resolved before the keeper's redeem tx
    // was indexed: realized PnL is deeply negative (cost recognized, payout
    // not yet), but the wUSDe is already earmarked in `vaultUnredeemedClaim`.
    // The cumulative must net those so the chart doesn't show a phantom loss.
    mockGetProtocolStatsTimeSeries.mockResolvedValue([
      baseSnapshot(1_000_000, {
        vaultRealizedPnL: '100',
        vaultUnredeemedClaim: '0',
      }),
      baseSnapshot(1_086_400, {
        vaultRealizedPnL: '-970',
        vaultUnredeemedClaim: '988',
        vaultSecondaryBought: '5',
        vaultSecondarySold: '7',
      }),
    ]);
    await stubVaultHelpers();
    const svc = await import('../../../../services/protocolStats');
    vi.mocked(svc.calculateVaultPnL).mockResolvedValue({
      realizedPnL: -970n,
      positionsWon: 0,
      positionsLost: 0,
      totalCollateralWon: 0n,
      totalCollateralLost: 970n,
    });
    vi.mocked(svc.calculateVaultSecondaryFlows).mockResolvedValue({
      bought: 5n,
      sold: 7n,
    });
    vi.mocked(svc.calculateVaultUnredeemedClaim).mockResolvedValue(988n);

    const result = await vaultStatsFn(
      {} as never,
      { vaultAddress: PROTOCOL_VAULT },
      {} as never,
      {} as never
    );

    // 2 persisted snapshots + 1 live candle.
    expect(result).toHaveLength(3);
    // Snapshot 0: 100 + 0 + 0 - 0
    expect(result[0].cumulativePnL).toBe('100');
    // Snapshot 1: -970 + 988 + 7 - 5 = 20
    expect(result[1].cumulativePnL).toBe('20');
    // Period PnL between the two snapshots: 20 - 100 = -80
    expect(result[1].periodPnL).toBe('-80');
    // Live candle: realizedPnL(-970) + unredeemed(988) + sold(7) - bought(5) = 20
    expect(result[2].cumulativePnL).toBe('20');
  });
});

describe('Query.vault', () => {
  it('resolves a valid Vault global id', async () => {
    const result = await vaultFn(
      {} as never,
      { id: toGlobalId('Vault', `42161:${PROTOCOL_VAULT}`) },
      {} as never,
      {} as never
    );

    expect(result).toMatchObject({
      id: toGlobalId('Vault', `42161:${PROTOCOL_VAULT}`),
      address: PROTOCOL_VAULT,
      chainId: 42161,
    });
  });

  it('returns null for malformed or non-Vault ids instead of throwing', async () => {
    await expect(
      vaultFn(
        {} as never,
        { id: '0x0000000000000000000000000000000000000000' },
        {} as never,
        {} as never
      )
    ).resolves.toBeNull();

    await expect(
      vaultFn({} as never, { id: 'not-a-global-id' }, {} as never, {} as never)
    ).resolves.toBeNull();

    await expect(
      vaultFn(
        {} as never,
        {
          id: Buffer.from(
            'Account:0x0000000000000000000000000000000000000000'
          ).toString('base64url'),
        },
        {} as never,
        {} as never
      )
    ).resolves.toBeNull();
  });
});

describe('Query.protocolStats windowing — first-bar baseline trick', () => {
  it('omits leading baseline fetch when no fromEpoch is set', async () => {
    mockGetProtocolStatsTimeSeries.mockResolvedValue([baseSnapshot(1_000_000)]);
    await stubVaultHelpers();

    await protocolStatsFn({} as never, {}, {} as never, {} as never);

    expect(mockGetPriorSnapshot).not.toHaveBeenCalled();
  });

  it('prepends a baseline snapshot before fromEpoch then trims it from the result', async () => {
    // Window starts at t=2; baseline lives at t=1 (before fromEpoch).
    // Inside-window snapshots at t=2 and t=3.
    mockGetProtocolStatsTimeSeries.mockResolvedValue([
      baseSnapshot(2_000_000),
      baseSnapshot(3_000_000),
    ]);
    mockGetPriorSnapshot.mockResolvedValue(baseSnapshot(1_000_000));
    await stubVaultHelpers();

    const result = await protocolStatsFn(
      {} as never,
      { fromEpoch: 2_000_000, toEpoch: 0 /* historical: < now */ },
      {} as never,
      {} as never
    );

    // No live candle (window strictly past); just the 2 windowed rows.
    // Baseline row is consumed for periodVolume anchoring then dropped.
    expect(result).toHaveLength(2);
    expect(mockGetPriorSnapshot).toHaveBeenCalledTimes(1);
    expect(mockGetPriorSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ fromEpoch: 2_000_000 })
    );
    // Display-shifted timestamps: snapshot.timestamp - interval(86_400).
    expect(result[0].timestamp).toBe(2_000_000 - 86_400);
    expect(result[1].timestamp).toBe(3_000_000 - 86_400);
  });

  it('skips the live candle when toEpoch is strictly in the past', async () => {
    mockGetProtocolStatsTimeSeries.mockResolvedValue([baseSnapshot(1_000_000)]);
    await stubVaultHelpers();

    const result = await protocolStatsFn(
      {} as never,
      { toEpoch: 1_000_000 }, // toEpoch < now ⇒ historical-only window
      {} as never,
      {} as never
    );

    // Only the closed bar; no live candle appended.
    expect(result).toHaveLength(1);
    const svc = await import('../../../../services/protocolStats');
    expect(svc.fetchVaultTVL).not.toHaveBeenCalled();
  });

  it('emits the live candle when toEpoch covers now', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockGetProtocolStatsTimeSeries.mockResolvedValue([baseSnapshot(1_000_000)]);
    await stubVaultHelpers();

    const result = await protocolStatsFn(
      {} as never,
      { toEpoch: nowSec + 3600 }, // > now ⇒ live candle still emitted
      {} as never,
      {} as never
    );

    expect(result).toHaveLength(2); // closed bar + live candle
    const svc = await import('../../../../services/protocolStats');
    expect(svc.fetchVaultTVL).toHaveBeenCalled();
  });

  it('handles fromEpoch with no prior snapshot (returns null) without crashing', async () => {
    mockGetProtocolStatsTimeSeries.mockResolvedValue([baseSnapshot(2_000_000)]);
    mockGetPriorSnapshot.mockResolvedValue(null);
    await stubVaultHelpers();

    const result = await protocolStatsFn(
      {} as never,
      { fromEpoch: 1_500_000, toEpoch: 0 },
      {} as never,
      {} as never
    );

    expect(result).toHaveLength(1);
    expect(mockGetPriorSnapshot).toHaveBeenCalled();
  });

  it('returns [] when there are no windowed snapshots at all', async () => {
    mockGetProtocolStatsTimeSeries.mockResolvedValue([]);

    const result = await protocolStatsFn(
      {} as never,
      { fromEpoch: 99_999_999_999 },
      {} as never,
      {} as never
    );

    expect(result).toEqual([]);
    expect(mockGetPriorSnapshot).not.toHaveBeenCalled();
  });
});
