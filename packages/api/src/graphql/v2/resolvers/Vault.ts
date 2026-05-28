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
import prisma from '../../../core/db';
import {
  getConfiguredVaults,
  getLatestProtocolStats,
} from '../../../services/protocolStats';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';
import type { VaultResolvers } from '../__generated__/resolvers';

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

type SnapshotRow = NonNullable<
  Awaited<ReturnType<typeof getLatestProtocolStats>>
>;

/**
 * Map a `protocol_stats_snapshot` row to the public `VaultStat` wire
 * shape — drops the `vault*` column prefixes (redundant under `Vault`)
 * and coerces the VarChar-stored bigints.
 */
const mapVaultStat = (row: SnapshotRow) => ({
  timestamp: row.timestamp,
  balance: BigInt(row.vaultBalance ?? '0'),
  deployedCollateral: BigInt(row.vaultDeployed ?? '0'),
  undeployedCollateral: BigInt(row.vaultAvailableAssets ?? '0'),
  realizedPnl: BigInt(row.vaultRealizedPnL ?? '0'),
  deposits: BigInt(row.vaultDeposits ?? '0'),
  withdrawals: BigInt(row.vaultWithdrawals ?? '0'),
  positionsWon: row.vaultPositionsWon,
  positionsLost: row.vaultPositionsLost,
  collateralWon: BigInt(row.vaultCollateralWon ?? '0'),
  collateralLost: BigInt(row.vaultCollateralLost ?? '0'),
});

/**
 * `stats` reads the vault's latest snapshot; `statsHistory` pages the
 * time series newest-first with an offset cursor (snapshots are a
 * bounded daily series). Both key on `(chainId, vaultAddress)`, indexed
 * on `protocol_stats_snapshot`. Identity (`id`, `address`, `chainId`)
 * stays a plain property read off the mapped row.
 */
export const Vault: VaultResolvers = {
  stats: async (parent) => {
    const snapshot = await getLatestProtocolStats(
      parent.chainId,
      parent.address.toLowerCase()
    );
    return snapshot ? (mapVaultStat(snapshot) as never) : null;
  },

  statsHistory: async (parent, args) => {
    const first = clampTake(args.first ?? 30, {
      defaultTake: 30,
      maxTake: 365,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const skip = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

    const where = {
      chainId: parent.chainId,
      vaultAddress: parent.address.toLowerCase(),
      ...(args.filter?.timestamp
        ? {
            timestamp: {
              ...(args.filter.timestamp.gte != null
                ? { gte: args.filter.timestamp.gte }
                : {}),
              ...(args.filter.timestamp.lte != null
                ? { lte: args.filter.timestamp.lte }
                : {}),
            },
          }
        : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.protocolStatsSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: first + 1,
      }),
      prisma.protocolStatsSnapshot.count({ where }),
    ]);

    return buildConnection({
      rows,
      first,
      totalCount,
      getNode: (row) => mapVaultStat(row),
      getCursor: (_row, idx) => encodeCursor({ k: String(skip + idx), id: '' }),
    }) as never;
  },
};

export { DEFAULT_CHAIN_ID };
