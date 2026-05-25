/* eslint-disable @typescript-eslint/no-explicit-any */
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
  kind: 'PROTOCOL' | 'PYTH' | 'SINGLE_LEG' | 'STRATEGY_B';
  legacyAddresses: string[];
};

const KIND_MAP: Record<string, VaultRow['kind']> = {
  protocol: 'PROTOCOL',
  pyth: 'PYTH',
  'single-leg': 'SINGLE_LEG',
  'strategy-b': 'STRATEGY_B',
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
  kind: KIND_MAP[v.kind],
  legacyAddresses: (v.config.legacy ?? []).map((le) =>
    normalizeLegacyEntry(le).address.toLowerCase()
  ),
});

export const findVaultByAddress = (
  chainId: number,
  address: string
): VaultRow | null => {
  const addr = address.toLowerCase();
  const vault = getConfiguredVaults(chainId).find(
    (v) =>
      v.address === addr ||
      (v.config.legacy ?? []).some(
        (le) => normalizeLegacyEntry(le).address.toLowerCase() === addr
      )
  );
  return vault ? mapVault(vault, chainId) : null;
};

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
