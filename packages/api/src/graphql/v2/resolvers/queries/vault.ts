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
import type { QueryResolvers } from '../../__generated__/resolvers';
import { CACHE_HINTS, setCacheHint } from '../../cacheHints';

export const vault: NonNullable<QueryResolvers['vault']> = async (
  _parent,
  { address, chainId }
) => findVaultByAddress(chainId ?? DEFAULT_CHAIN_ID, address) as never;

export const vaults: NonNullable<QueryResolvers['vaults']> = async (
  _parent,
  args,
  _ctx,
  info
) => {
  // Configured statically; the catalog changes on releases. 1h cache.
  setCacheHint(info, CACHE_HINTS.STATIC_ONE_HOUR);
  const first = clampTake(args.first ?? 50, { defaultTake: 50, maxTake: 100 });
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
    const kind = args.filter.kind;
    nodes = nodes.filter((n) => n.kind === kind);
  }

  const direction =
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
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  } as never;
};
