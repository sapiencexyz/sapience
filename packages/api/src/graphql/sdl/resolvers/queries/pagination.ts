/**
 * Shared pagination helpers for `*Page` resolvers.
 *
 * Standard limits across the surface:
 *   - `take` capped at 100 (server-side fan-out budget). Per-resolver
 *     defaults vary (25 for leaderboards, 50 for list pages, 20 for the
 *     activity feed); pass them via `defaultTake` so the clamp can fall
 *     back when callers send invalid input.
 *   - `skip` capped at 1000 by default. `MAX_SKIP` exists to bound
 *     offset-style pagination: a `skip` of e.g. 50_000 forces Postgres
 *     to scan and discard every preceding row, even with the right
 *     index. 1_000 covers every realistic infinite-scroll use case
 *     (max take is 100, so 11 pages deep) while making accidental
 *     deep-skip queries fail-fast rather than silently expensive.
 *     Resolvers with a different access pattern can opt into a higher
 *     ceiling by passing `maxSkip`.
 *
 * Hot paths that need to read further than `MAX_SKIP` should adopt
 * cursor / keyset pagination (`after: String` on `(createdAt, id)`) —
 * the row count returned via `totalCount` is already enough for "X
 * items total" UI badges without paying the offset cost.
 */

import { decodeCursor } from '../../../relay/cursor';

export const MAX_TAKE = 100;
export const MAX_SKIP = 1000;

export const clampTake = (
  take: number | null | undefined,
  { defaultTake, maxTake = MAX_TAKE }: { defaultTake: number; maxTake?: number }
): number => {
  const value = take ?? defaultTake;
  if (!Number.isFinite(value) || value <= 0)
    return Math.min(defaultTake, maxTake);
  return Math.max(1, Math.min(Math.floor(value), maxTake));
};

export const clampSkip = (
  skip: number | null | undefined,
  { maxSkip = MAX_SKIP }: { maxSkip?: number } = {}
): number => {
  const value = skip ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), maxSkip);
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
   * a complete row set in memory — e.g. small in-process collections), or
   * a thunk that runs the count query on demand. When passed a thunk, the
   * count is invoked by graphql-js's default field resolver only if the
   * client actually selects `totalCount`. Most paginated UIs read the
   * total once on the first page and paginate via cursor after that, so
   * the lazy form saves one DB roundtrip on every follow-on request.
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

  // graphql-js's default field resolver invokes functions found on the
  // parent under the field's name. Stashing the thunk here lets the
  // count fire lazily — only when the client selects `totalCount` — with
  // no per-connection resolver boilerplate. The `as unknown as number`
  // squeezes the function through the strict generated parent type.
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
