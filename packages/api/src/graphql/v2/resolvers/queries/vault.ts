/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `vault(address:, chainId:)` / `vaults(...)` — singular + Relay
 * connection over the statically configured vault catalog. The catalog
 * is small enough that the connection pages in-memory.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';
import { findVaultByAddress, mapVault, type VaultRow } from '../Vault';
import { getConfiguredVaults } from '../../../../services/protocolStats';

export const vault = async (
  _parent: unknown,
  { address, chainId }: { address: string; chainId?: number | null }
): Promise<VaultRow | null> =>
  findVaultByAddress(chainId ?? DEFAULT_CHAIN_ID, address);

export const vaults = async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      address?: string | null;
      chainId?: number | null;
      kind?: VaultRow['kind'] | null;
    } | null;
    orderBy?: { field: string; direction: string } | null;
  }
) => {
  const first = clampTake(args.first ?? 50, {
    defaultTake: 50,
    maxTake: 100,
  });
  const chainId = args.filter?.chainId ?? DEFAULT_CHAIN_ID;

  // The configured catalog is tiny (≤ ~5 entries per chain). Materialize
  // the filtered list, then paginate offset-style.
  let nodes: VaultRow[];
  if (args.filter?.address) {
    const node = findVaultByAddress(chainId, args.filter.address);
    nodes = node ? [node] : [];
  } else {
    nodes = getConfiguredVaults(chainId).map((v) => mapVault(v, chainId));
  }

  if (args.filter?.kind) {
    nodes = nodes.filter((n) => n.kind === args.filter!.kind);
  }

  const direction: 'asc' | 'desc' =
    String(args.orderBy?.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
  nodes = [...nodes].sort((a, b) =>
    direction === 'asc'
      ? a.address.localeCompare(b.address)
      : b.address.localeCompare(a.address)
  );

  const totalCount = nodes.length;
  const startOffset = (() => {
    const payload = args.after ? decodeCursor(args.after) : null;
    const offset = payload ? Number(payload.k) : Number.NaN;
    return Number.isInteger(offset) && offset >= 0 ? offset + 1 : 0;
  })();
  const window = nodes.slice(startOffset, startOffset + first);
  const edges = window.map((node, i) => ({
    node,
    cursor: encodeCursor({ k: String(startOffset + i), id: node.address }),
  }));

  return {
    edges,
    nodes: window,
    totalCount,
    pageInfo: {
      hasNextPage: startOffset + window.length < totalCount,
      hasPreviousPage: startOffset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};
