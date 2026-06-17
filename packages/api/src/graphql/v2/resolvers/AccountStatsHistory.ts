/**
 * `Account.statsHistory` field resolver. Backed by the live, bucketed series
 * in `./queries/accountStatsHistory`.
 *
 * Like `collateralBalanceHistory`, the underlying series is a full
 * `generate_series` grid — every bucket in the requested window is present —
 * so `totalCount` / `hasNextPage` are derived analytically from the
 * materialized extent rather than `buildConnection`'s over-fetch-by-one
 * heuristic, which a synthetic grid defeats (it always has a lookahead row, so
 * "ran out of rows" never fires). Forward-only, offset-style cursor; the
 * window is bounded per interval (≤365 buckets), so the default page returns
 * the whole series.
 */

import type { AccountResolvers } from '../__generated__/resolvers';
import { clampTake, decodeCursor, encodeCursor } from '../relay/connection';
import { getAccountStatsHistory } from './queries/accountStatsHistory';

const addressOf = (parent: { address?: string | null }): string =>
  (parent.address ?? '').toLowerCase();

// Bucket grids top out at the per-interval cap (365 for DAY); a default this
// size returns the full window in one page while still honouring first/after.
const MAX_STATS_POINTS = 366;

const toDate = (seconds: number | null | undefined): Date | undefined =>
  seconds == null ? undefined : new Date(seconds * 1000);

export const statsHistoryField: NonNullable<
  AccountResolvers['statsHistory']
> = async (parent, args) => {
  const first = clampTake(args.first ?? MAX_STATS_POINTS, {
    defaultTake: MAX_STATS_POINTS,
    maxTake: MAX_STATS_POINTS,
  });
  const after = args.after ? decodeCursor(args.after) : null;
  const offset = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;

  const rows = await getAccountStatsHistory({
    address: addressOf(parent),
    interval: args.interval,
    from: toDate(args.filter?.timestamp?.gte),
    to: toDate(args.filter?.timestamp?.lte),
  });
  // The grid always materializes the full window, so its length is the true,
  // page-invariant extent — totalCount / hasNextPage derive from it directly.
  const extent = rows.length;

  const pageRows = rows.slice(offset, offset + first);
  const edges = pageRows.map((node, idx) => ({
    node,
    cursor: encodeCursor({
      k: String(offset + idx),
      id: String(node.timestamp),
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
