import { describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockGetLatestProtocolStats = vi.hoisted(() => vi.fn());

vi.mock('../../../services/protocolStats', () => ({
  getConfiguredVaults: vi.fn(() => [
    {
      kind: 'protocol',
      address: '0x000000000000000000000000000000000000aaaa',
      config: { legacy: [] },
    },
    {
      kind: 'pyth',
      address: '0x000000000000000000000000000000000000bbbb',
      config: { legacy: [] },
    },
  ]),
  getLatestProtocolStats: mockGetLatestProtocolStats,
}));

vi.mock('@sapience/sdk/contracts', () => ({
  normalizeLegacyEntry: (le: { address?: string } | string) =>
    typeof le === 'string' ? { address: le } : { address: le.address ?? '' },
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 13374202,
}));

vi.mock('../../../core/db', () => ({
  default: {
    protocolStatsSnapshot: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock('../accountSynthesis', () => ({
  synthesizeAccount: (address: string) => ({
    address,
    createdAt: new Date(0),
  }),
}));

// Vault.ts registers `Vault` in the v2 Node registry at module import.
import { findVaultByAddress, Vault } from './Vault';
import { vault, vaults } from './queries/vault';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('Vault (v2)', () => {
  it('encodes the global id as v2 Vault:<chainId>:<lowercase-address>', () => {
    const row = findVaultByAddress(
      13374202,
      '0x000000000000000000000000000000000000AAAA'
    );
    expect(row).not.toBeNull();
    expect(fromGlobalIdV2(row!.id)).toEqual({
      type: 'Vault',
      id: '13374202:0x000000000000000000000000000000000000aaaa',
    });
  });

  it('vault(address:) finds by current primary address', async () => {
    const row = await callResolver<{ address: string } | null>(vault)(
      null,
      { address: '0x000000000000000000000000000000000000bbbb' },
      {},
      null
    );
    expect(row?.address).toBe('0x000000000000000000000000000000000000bbbb');
  });

  it('vault(address:) returns null for an unknown address', async () => {
    const row = await callResolver<unknown>(vault)(
      null,
      { address: '0x0000000000000000000000000000000000000000' },
      {},
      null
    );
    expect(row).toBeNull();
  });

  it('vaults(...) enumerates the configured catalog', async () => {
    const result = await callResolver<{
      nodes: { address: string }[];
      totalCount: number;
    }>(vaults)(null, {}, {}, null);
    expect(result.totalCount).toBe(2);
    expect(result.nodes.map((n) => n.address).sort()).toEqual([
      '0x000000000000000000000000000000000000aaaa',
      '0x000000000000000000000000000000000000bbbb',
    ]);
  });

  it('account composes a chain-scoped Account from the vault row', async () => {
    const acct = await callResolver<{ address: string; chainId: number }>(
      Vault.account
    )({ id: 'x', address: '0xAAAA', chainId: 13374202 }, {}, {}, null);
    expect(acct.address).toBe('0xaaaa');
    expect(acct.chainId).toBe(13374202);
  });

  it('stats maps the latest snapshot to the VaultStat wire shape', async () => {
    mockGetLatestProtocolStats.mockResolvedValue({
      timestamp: 1700000000,
      vaultBalance: '1000',
      vaultDeployed: '500',
      vaultAvailableAssets: '1500',
      vaultRealizedPnL: '42',
      vaultUnredeemedClaim: '10',
      vaultSecondarySold: '5',
      vaultSecondaryBought: '3',
      vaultDeposits: '2000',
      vaultWithdrawals: '300',
      vaultPositionsWon: 7,
      vaultPositionsLost: 2,
      vaultCollateralWon: '800',
      vaultCollateralLost: '100',
    });
    const stat = await callResolver<{
      deployedCollateral: bigint;
      undeployedCollateral: bigint;
      balance: bigint;
      realizedPnl: bigint;
      cumulativePnl: bigint;
      unredeemedClaim: bigint;
      positionsWon: number;
    }>(Vault.stats)({ chainId: 13374202, address: '0xAAAA' }, {}, {}, null);
    expect(stat.deployedCollateral).toBe(500n);
    expect(stat.undeployedCollateral).toBe(1500n);
    expect(stat.balance).toBe(1000n);
    expect(stat.realizedPnl).toBe(42n);
    // cumulativePnl = realized + unredeemed + secondarySold − secondaryBought
    expect(stat.cumulativePnl).toBe(54n);
    // unredeemedClaim is surfaced directly from vaultUnredeemedClaim.
    expect(stat.unredeemedClaim).toBe(10n);
    expect(stat.positionsWon).toBe(7);
  });

  it('stats returns null when no snapshot exists', async () => {
    mockGetLatestProtocolStats.mockResolvedValue(null);
    const stat = await callResolver<unknown>(Vault.stats)(
      { chainId: 13374202, address: '0xAAAA' },
      {},
      {},
      null
    );
    expect(stat).toBeNull();
  });
});
