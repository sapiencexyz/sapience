/**
 * `Account.collateralBalance` and `Account.collateralBalanceHistory`
 * field resolvers. Backed by the v2-local SQL helpers in
 * `./queries/collateralBalance`.
 *
 * The history connection is forward-only with an offset-style cursor —
 * the row set is materialized in-memory by the SQL CTE, so keyset
 * paging would buy nothing over slicing.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import type { AccountResolvers } from '../__generated__/resolvers';
import { clampTake, decodeCursor, encodeCursor } from '../relay/connection';
import {
  getCollateralBalance,
  getCollateralBalanceHistory,
} from './queries/collateralBalance';

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

// chainId comes from the (chain-scoped) parent account, not a field arg.
const chainIdOf = (parent: unknown): number =>
  (parent as { chainId?: number | null }).chainId ?? DEFAULT_CHAIN_ID;

export const collateralBalanceField: NonNullable<
  AccountResolvers['collateralBalance']
> = async (parent, args) => {
  const row = await getCollateralBalance({
    address: addressOf(parent),
    chainId: chainIdOf(parent),
    atBlock: args.atBlock ?? null,
  });
  // Point-lookup populates `blockNumber`; `timestamp` is the other axis
  // and stays null here.
  return { ...row, timestamp: null } as never;
};

export const collateralBalanceHistoryField: NonNullable<
  AccountResolvers['collateralBalanceHistory']
> = async (parent, args) => {
  const first = clampTake(args.first ?? 12, {
    defaultTake: 12,
    maxTake: 200,
  });
  const after = args.after ? decodeCursor(args.after) : null;
  const offset = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

  // The history series is a synthetic generate_series grid of FIXED extent:
  // HISTORY_BUCKETS boundaries back from now (≈1 year at the 7-day default
  // stride). Fetch the whole grid (its running-sum needs every boundary to be
  // correct) and slice the page out — at this size the per-page full-grid
  // fetch is negligible, so no windowed over-fetch optimization is needed.
  const HISTORY_BUCKETS = 52;
  const rows = await getCollateralBalanceHistory({
    address: addressOf(parent),
    chainId: chainIdOf(parent),
    count: HISTORY_BUCKETS,
    intervalSeconds: args.intervalSeconds ?? null,
  });
  // The grid always materializes the full series, so its length is the true,
  // page-invariant extent. totalCount and hasNextPage are derived from it
  // analytically — NOT from buildConnection's over-fetch-by-one heuristic,
  // which a synthetic grid defeats: it ALWAYS has a lookahead row, so "ran
  // out of rows" never fires, making totalCount drift up per page and
  // hasNextPage never terminate (#7).
  const extent = rows.length;

  const pageRows = rows.slice(offset, offset + first).map((row) => ({
    ...row,
    // History buckets populate `timestamp`; `blockNumber` is the other
    // axis and stays null here (no block is pinned per bucket).
    blockNumber: null,
  }));

  const edges = pageRows.map((node, idx) => ({
    node,
    cursor: encodeCursor({
      k: String(offset + idx),
      id: node.timestamp.toISOString(),
    }),
  }));

  return {
    edges,
    nodes: pageRows,
    totalCount: extent,
    pageInfo: {
      hasNextPage: offset + first < extent,
      hasPreviousPage: offset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  } as never;
};
