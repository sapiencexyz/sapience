'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

/**
 * Forward-only cursor pagination for GraphQL connections.
 *
 * The old plural queries were skip/take with a `+1` over-fetch to detect "more"
 * (see `usePositions`, `useAccountActivity`). Connections are Relay forward-only:
 * `first` / `after` in, `{ edges { node, cursor }, pageInfo, totalCount }`
 * out. This hook is the shared adapter for that shape so every consumer
 * gets the same loadMore / hasNextPage / accumulated-nodes contract instead
 * of reimplementing cursor threading per query.
 *
 * It wraps `useInfiniteQuery`, threading the previous page's
 * `pageInfo.endCursor` as the next page's `after`, and flattens
 * `edges[].node` across all loaded pages into `data`.
 */

/** The Relay connection shape resolvers return under `connectionKey`. */
export type RelayPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type RelayEdge<TNode> = {
  node: TNode;
  cursor: string;
};

export type RelayConnection<TNode> = {
  edges: RelayEdge<TNode>[];
  pageInfo: RelayPageInfo;
  totalCount?: number;
};

const EMPTY_CONNECTION: RelayConnection<never> = {
  edges: [],
  pageInfo: { hasNextPage: false, endCursor: null },
  totalCount: 0,
};

const DEFAULT_PAGE_SIZE = 25;

export interface UseCursorPaginationParams {
  /** React Query cache key. The hook does not append page params — the
   *  cursor lives in `useInfiniteQuery`'s page list, not the key. */
  queryKey: readonly unknown[];
  /** A connection query exposing `first: Int!` and `after: String`. */
  query: string;
  /** Top-level field name the connection is returned under (e.g. `questions`). */
  connectionKey: string;
  /** Page size forwarded as `first`. */
  pageSize?: number;
  /** Extra query variables merged into every request (filters, ids, etc). */
  variables?: Record<string, unknown>;
  /** Gate the query (e.g. until a required arg is present). Defaults true. */
  enabled?: boolean;
  /** Override React Query staleTime (ms). */
  staleTime?: number;
}

export interface UseCursorPaginationResult<TNode> {
  /** Accumulated `edges[].node` across every loaded page. */
  data: TNode[];
  /** Total matching rows reported by the most recent page, when selected. */
  totalCount: number;
  isLoading: boolean;
  /** True while a follow-on page (loadMore) is in flight. */
  isFetchingMore: boolean;
  isFetching: boolean;
  hasNextPage: boolean;
  /** Fetch the next page using the last page's `endCursor`. No-op when
   *  exhausted or already fetching. */
  loadMore: () => void;
  error: unknown;
  refetch: () => void;
}

/**
 * Generic forward-cursor pagination over a Relay connection.
 *
 * @example
 * const { data, loadMore, hasNextPage } = useCursorPagination<Question>({
 *   queryKey: ['questions', category],
 *   query: QUESTIONS_QUERY,
 *   connectionKey: 'questions',
 *   variables: { category },
 * });
 */
export function useCursorPagination<TNode>(
  params: UseCursorPaginationParams
): UseCursorPaginationResult<TNode> {
  const {
    queryKey,
    query,
    connectionKey,
    pageSize = DEFAULT_PAGE_SIZE,
    variables,
    enabled = true,
    staleTime = 30_000,
  } = params;

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...queryKey, connectionKey, pageSize, variables ?? null],
    enabled,
    staleTime,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // `after: null` is the first page; subsequent pages thread the previous
    // page's endCursor in via getNextPageParam.
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: RelayConnection<TNode>) =>
      lastPage.pageInfo.hasNextPage
        ? (lastPage.pageInfo.endCursor ?? undefined)
        : undefined,
    queryFn: async ({ pageParam }) => {
      const resp = await graphqlRequest<Record<string, RelayConnection<TNode>>>(
        query,
        {
          ...(variables ?? {}),
          first: pageSize,
          after: pageParam ?? null,
        }
      );
      return resp?.[connectionKey] ?? EMPTY_CONNECTION;
    },
  });

  const nodes = useMemo(
    () => data?.pages.flatMap((page) => page.edges.map((e) => e.node)) ?? [],
    [data]
  );

  // totalCount is a page-invariant extent; read it off the latest page.
  const totalCount = data?.pages.at(-1)?.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    data: nodes,
    totalCount,
    isLoading: enabled && isLoading,
    isFetchingMore: isFetchingNextPage,
    isFetching: enabled && isFetching,
    hasNextPage: Boolean(hasNextPage),
    loadMore,
    error,
    refetch,
  };
}
