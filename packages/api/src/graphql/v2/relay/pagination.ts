/**
 * Forward-only Relay pagination primitives for v2 resolvers.
 *
 * Limits:
 *   - `take` capped at 100 (server-side fan-out budget). Per-resolver
 *     defaults vary (25 leaderboards, 50 list pages, 100 collateral
 *     transfers); pass them via `defaultTake` so the clamp can fall
 *     back when callers send invalid input.
 *
 * Hot paths that need to read further than offset-style allows should
 * already be on keyset (`after:` on `(<orderColumn>, id)`); `clampTake`
 * applies in both regimes.
 */

import { decodeCursor } from './cursor';

export const MAX_TAKE = 100;

export const clampTake = (
  take: number | null | undefined,
  { defaultTake, maxTake = MAX_TAKE }: { defaultTake: number; maxTake?: number }
): number => {
  const value = take ?? defaultTake;
  if (!Number.isFinite(value) || value <= 0)
    return Math.min(defaultTake, maxTake);
  return Math.max(1, Math.min(Math.floor(value), maxTake));
};

export const offsetFromCursor = (cursor: string | null | undefined): number => {
  const payload = cursor ? decodeCursor(cursor) : null;
  const offset = payload ? Number(payload.k) : Number.NaN;
  return Number.isInteger(offset) && offset >= 0 ? offset + 1 : 0;
};

type BuildConnectionArgs<TRow, TNode = TRow> = {
  rows: readonly TRow[];
  first: number;
  getCursor: (row: TRow, index: number) => string;
  getNode?: (row: TRow, index: number) => TNode;
  /**
   * Either an eagerly-computed total (cheap when the resolver already has
   * the full set in memory), or a thunk that runs the count on demand —
   * graphql-js's default field resolver invokes the function only when
   * the client selects `totalCount`, saving one DB roundtrip on every
   * cursor-paginated follow-on request.
   */
  totalCount: number | (() => number | Promise<number>);
  hasPreviousPage?: boolean;
};

type ConnectionEdge<TNode> = { node: TNode; cursor: string };

export const buildConnection = <TRow, TNode = TRow>({
  rows,
  first,
  getCursor,
  getNode,
  totalCount,
  hasPreviousPage = false,
}: BuildConnectionArgs<TRow, TNode>): {
  edges: ConnectionEdge<TNode>[];
  nodes: TNode[];
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
} => {
  const hasNextPage = rows.length > first;
  const pageRows = hasNextPage ? rows.slice(0, first) : rows;
  const nodes = pageRows.map((row, index) =>
    getNode ? getNode(row, index) : (row as unknown as TNode)
  );
  const edges = pageRows.map((row, index) => ({
    node: nodes[index],
    cursor: getCursor(row, index),
  }));

  // Stash the count thunk under `totalCount` so graphql-js's default field
  // resolver invokes it lazily only when the client selects the field.
  const totalCountField =
    typeof totalCount === 'function'
      ? (totalCount as unknown as number)
      : totalCount;

  return {
    edges,
    nodes,
    totalCount: totalCountField,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  };
};
