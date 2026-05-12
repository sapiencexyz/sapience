import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

type ProtocolStatsFn = (
  parent: unknown,
  args: { vaultAddress?: string | null },
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
const protocolStatsFn = protocolStats as unknown as ProtocolStatsFn;

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
    const result = await protocolStatsFn(
      {} as never,
      { vaultAddress: '0xdeadbeef' },
      {} as never,
      {} as never
    );

    expect(result).toEqual([]);
    expect(mockGetProtocolStatsTimeSeries).not.toHaveBeenCalled();
  });
});

describe('analytics OI aggregation counts private conditions', () => {
  const source = readFileSync(resolve(__dirname, './analytics.ts'), 'utf8');

  it('does not exclude predictions touching private conditions from OI', () => {
    expect(source).not.toMatch(/c\.public\s*=\s*false/);
    expect(source).not.toMatch(/BOOL_AND\(\s*c\.public\s*\)/);
    expect(source).not.toMatch(/all_public/);
  });

  it('openInterestByCategory does not filter conditions on public', () => {
    expect(source).not.toMatch(/c\.public\s*=\s*true/);
  });
});
