/**
 * v2 Vault — implements Node.
 *
 * The configured-vault catalog comes from `services/protocolStats/vaultConfig`,
 * the same source v1 reads from. A vault is an account by composition:
 * `Vault.account` exposes its address, chainId, balance, and ranking, so the
 * `Vault` type itself carries no `address`/`chainId` fields (the mapped row
 * still holds them internally to key snapshot lookups).
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
import { loadAccount } from './queries/account';
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
  // Cumulative trading PnL — same roll-up v1's analytics chart uses
  // (settlement + unredeemed wins + net secondary flow). Sourced entirely
  // from existing snapshot columns; no live recomputation here.
  cumulativePnl:
    BigInt(row.vaultRealizedPnL ?? '0') +
    BigInt(row.vaultUnredeemedClaim ?? '0') +
    BigInt(row.vaultSecondarySold ?? '0') -
    BigInt(row.vaultSecondaryBought ?? '0'),
  deposits: BigInt(row.vaultDeposits ?? '0'),
  withdrawals: BigInt(row.vaultWithdrawals ?? '0'),
  positionsWon: row.vaultPositionsWon,
  positionsLost: row.vaultPositionsLost,
  collateralWon: BigInt(row.vaultCollateralWon ?? '0'),
  collateralLost: BigInt(row.vaultCollateralLost ?? '0'),
  // wUSDe owed to the vault on resolved-but-not-yet-redeemed winning sides,
  // net of what it has already claimed. Also a term in `cumulativePnl` above;
  // surfaced on its own so the vault dashboard's TVL line can include it.
  unredeemedClaim: BigInt(row.vaultUnredeemedClaim ?? '0'),
});

/**
 * `stats` reads the vault's latest snapshot; `statsHistory` pages the
 * time series newest-first with an offset cursor (snapshots are a
 * bounded daily series). Both key on `(chainId, vaultAddress)`, indexed
 * on `protocol_stats_snapshot`. Identity (`id`, `address`, `chainId`)
 * stays a plain property read off the mapped row.
 */
export const Vault: VaultResolvers = {
  // A vault is an account by composition. Resolve the same Account parent
  // shape the `account(address:)` query produces, scoped to the vault's chain.
  account: ((parent: VaultRow, _args: unknown, ctx: unknown) =>
    loadAccount(
      parent.address,
      parent.chainId,
      ctx as Parameters<typeof loadAccount>[2]
    )) as never,

  stats: async (parent) => {
    // DEFERRED — not built yet: returns the latest *recorded* snapshot. The
    // target is a live, non-null query-time chain read (reuse v1's live-candle
    // helpers in sdl/resolvers/queries/analytics.ts) so /vaults can drop
    // usePassiveLiquidityVault. Big lift — per-request RPC, not a snapshot map.
    //
    // The runtime parent is the mapped VaultRow (carries address/chainId for
    // snapshot lookups); the generated parent type no longer surfaces them
    // now that the public `Vault` reaches identity through `account`.
    const row = parent as unknown as VaultRow;
    const snapshot = await getLatestProtocolStats(
      row.chainId,
      row.address.toLowerCase()
    );
    return snapshot ? (mapVaultStat(snapshot) as never) : null;
  },

  statsHistory: async (parent, args) => {
    const row = parent as unknown as VaultRow;
    const first = clampTake(args.first ?? 30, {
      defaultTake: 30,
      maxTake: 365,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const skip = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

    // Query the vault's FULL address history — current primary plus every
    // demoted-to-legacy address — mirroring v1's `protocolStats`. Without the
    // legacies, an SDK redeploy orphans the entire historical chart until a
    // re-stamping backfill runs. The address set is per-family by construction,
    // so vault families never bleed across each other.
    const primary = row.address.toLowerCase();
    const match = getConfiguredVaults(row.chainId).find(
      (v) =>
        v.address === primary ||
        (v.config.legacy ?? []).some(
          (le) => normalizeLegacyEntry(le).address.toLowerCase() === primary
        )
    );
    const vaultAddresses = match
      ? [
          match.address,
          ...(match.config.legacy ?? []).map(
            (le) => normalizeLegacyEntry(le).address
          ),
        ].map((a) => a.toLowerCase())
      : [primary];
    const currentPrimary = match?.address.toLowerCase() ?? primary;

    const where = {
      chainId: row.chainId,
      vaultAddress: { in: vaultAddresses },
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

    // Snapshots are a bounded daily series, so fetch the full set and dedupe
    // in memory: a redeploy day can carry rows under multiple addresses, and
    // the current-primary row wins (matches the post-redeploy backfill). DB
    // skip/take can't dedupe-then-page correctly, so paginate after the dedupe.
    const allRows = await prisma.protocolStatsSnapshot.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
    const dedup = new Map<number, (typeof allRows)[number]>();
    for (const s of allRows) {
      const existing = dedup.get(s.timestamp);
      if (!existing || s.vaultAddress.toLowerCase() === currentPrimary) {
        dedup.set(s.timestamp, s);
      }
    }
    const deduped = Array.from(dedup.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const totalCount = deduped.length;
    const pageRows = deduped.slice(skip, skip + first + 1);

    return buildConnection({
      rows: pageRows,
      first,
      totalCount,
      getNode: (row) => mapVaultStat(row),
      getCursor: (_row, idx) => encodeCursor({ k: String(skip + idx), id: '' }),
    }) as never;
  },
};

export { DEFAULT_CHAIN_ID };
