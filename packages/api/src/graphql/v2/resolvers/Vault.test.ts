import { describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

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
}));

vi.mock('@sapience/sdk/contracts', () => ({
  normalizeLegacyEntry: (le: { address?: string } | string) =>
    typeof le === 'string' ? { address: le } : { address: le.address ?? '' },
}));

vi.mock('@sapience/sdk/constants', () => ({
  DEFAULT_CHAIN_ID: 13374202,
}));

// Vault.ts registers `Vault` in the v2 Node registry at module import.
import { findVaultByAddress } from './Vault';
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
    expect(row!.kind).toBe('PROTOCOL');
  });

  it('vault(address:) finds by current primary address', async () => {
    const row = await callResolver<{ kind: string } | null>(vault)(
      null,
      { address: '0x000000000000000000000000000000000000bbbb' },
      {},
      null
    );
    expect(row?.kind).toBe('PYTH');
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

  it('vaults(filter: { kind }) narrows the catalog', async () => {
    const result = await callResolver<{ nodes: { kind: string }[] }>(vaults)(
      null,
      { filter: { kind: 'PROTOCOL' } },
      {},
      null
    );
    expect(result.nodes.map((n) => n.kind)).toEqual(['PROTOCOL']);
  });
});
