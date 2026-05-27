/**
 * v2 Vault — implements Node & AddressEntity.
 *
 * The configured-vault catalog comes from `services/protocolStats/vaultConfig`,
 * the same source v1 reads from. v2's wire shape drops the leaked
 * `Account` relation and the `collateral` value type; both can be
 * derived (account by address, collateral via chainId mapping) and
 * neither is part of the "what is a vault" surface.
 *
 * Global id encoding is `(Vault, "<chainId>:<address>")` because a
 * vault is uniquely identified by its (chainId, address) pair — two
 * chains can each deploy under the same canonical address.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { normalizeLegacyEntry } from '@sapience/sdk/contracts';
import { getConfiguredVaults } from '../../../services/protocolStats';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';

export type VaultRow = {
  id: string; // pre-encoded global id
  address: string;
  chainId: number;
};

const vaultDomainId = (chainId: number, address: string) =>
  `${chainId}:${address.toLowerCase()}`;

const parseVaultDomainId = (id: string) => {
  const [chainIdRaw, addressRaw] = id.split(':');
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || !addressRaw) return null;
  return { chainId, address: addressRaw.toLowerCase() };
};

export const mapVault = (
  v: ReturnType<typeof getConfiguredVaults>[number],
  chainId: number
): VaultRow => ({
  id: toGlobalIdV2('Vault', vaultDomainId(chainId, v.address)),
  address: v.address.toLowerCase(),
  chainId,
});

// The configured vault catalog is static (set at deploy time) and tiny
// (≤5 entries per chain). Memoize the (vaults, by-address index) pair
// per chainId so every request reuses the same mapped rows instead of
// re-mapping and re-scanning on each call.
type VaultCatalog = {
  rows: VaultRow[];
  byAddress: Map<string, VaultRow>;
};

const catalogByChain = new Map<number, VaultCatalog>();

const getVaultCatalog = (chainId: number): VaultCatalog => {
  const hit = catalogByChain.get(chainId);
  if (hit) return hit;

  const configured = getConfiguredVaults(chainId);
  const rows = configured.map((v) => mapVault(v, chainId));
  const byAddress = new Map<string, VaultRow>();
  for (let i = 0; i < configured.length; i += 1) {
    const row = rows[i];
    byAddress.set(row.address, row);
    for (const le of configured[i].config.legacy ?? []) {
      byAddress.set(normalizeLegacyEntry(le).address.toLowerCase(), row);
    }
  }

  const catalog = { rows, byAddress };
  catalogByChain.set(chainId, catalog);
  return catalog;
};

export const getCachedVaultRows = (chainId: number): readonly VaultRow[] =>
  getVaultCatalog(chainId).rows;

export const findVaultByAddress = (
  chainId: number,
  address: string
): VaultRow | null =>
  getVaultCatalog(chainId).byAddress.get(address.toLowerCase()) ?? null;

registerNodeTypeV2({
  type: 'Vault',
  loader: async (id) => {
    const parsed = parseVaultDomainId(id);
    if (!parsed) return null;
    return findVaultByAddress(parsed.chainId, parsed.address);
  },
});

/**
 * No custom field resolvers — every Vault field is a plain property on
 * the mapped row. The map lives in this module so resolvers and the
 * Node loader stay in sync.
 */
export const Vault = {};

export { DEFAULT_CHAIN_ID };
