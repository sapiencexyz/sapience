import { graphqlRequest } from './client/graphqlClient';

/**
 * Shared helper for paging through any Relay-shaped `*Connection` query.
 *
 * Connections on the Sapience API are cursor-only: the server enforces
 * `first / after` and rejects offset-style emulation under its query
 * complexity ceiling (a "refetch with larger first" pattern fails on
 * the second page). This helper is the canonical way to call one — it
 * makes exactly one request, returns the page envelope verbatim, and
 * caps `take` at the server's per-page maximum so callers can't trip
 * the same limit by accident.
 *
 * Build each connection helper as a thin wrapper around this. The
 * wrapper owns the GraphQL string and the variable shape; this helper
 * owns the request, the cap, and the envelope unwrapping.
 */

export const CONNECTION_MAX_TAKE = 100;

type ConnectionEnvelope<T> = {
  nodes?: T[] | null;
  pageInfo?: {
    hasNextPage?: boolean | null;
    endCursor?: string | null;
  } | null;
};

export type ConnectionPage<T> = {
  items: T[];
  hasMore: boolean;
  endCursor: string | null;
};

/**
 * Cap `take` to the connection's per-page maximum. Negative / NaN / 0
 * fall back to `defaultTake`.
 */
export const clampConnectionTake = (
  take: number | null | undefined,
  defaultTake = 50
): number => {
  if (take == null || !Number.isFinite(take) || take <= 0) {
    return Math.min(defaultTake, CONNECTION_MAX_TAKE);
  }
  return Math.max(1, Math.min(Math.floor(take), CONNECTION_MAX_TAKE));
};

const normalizeConnectionTake = (
  take: number | null | undefined,
  defaultTake = 50
): number => {
  if (take == null || !Number.isFinite(take) || take <= 0) {
    return defaultTake;
  }
  return Math.max(1, Math.floor(take));
};

const normalizeConnectionSkip = (skip: number | null | undefined): number => {
  if (skip == null || !Number.isFinite(skip) || skip <= 0) {
    return 0;
  }
  return Math.floor(skip);
};

export const shouldFetchConnectionWindow = (
  take: number | null | undefined,
  skip: number | null | undefined,
  after: string | null | undefined,
  defaultTake = 50
): boolean =>
  after == null &&
  (normalizeConnectionSkip(skip) > 0 ||
    normalizeConnectionTake(take, defaultTake) > CONNECTION_MAX_TAKE);

/**
 * Run a connection query and return one page.
 *
 * @param query        The GraphQL query string. Must select `nodes` and
 *                     `pageInfo { hasNextPage endCursor }` on the
 *                     connection field.
 * @param variables    Variables for the query. Whatever the connection
 *                     accepts (filter / orderBy / `first` / `after` /
 *                     etc.) — pass them through; this helper doesn't
 *                     reshape them.
 * @param resultKey    The connection field name on the response root
 *                     (`questionsConnection`, `conditionsConnection`,
 *                     …).
 */
export async function fetchConnectionPage<T>(
  query: string,
  variables: Record<string, unknown>,
  resultKey: string
): Promise<ConnectionPage<T>> {
  const data = await graphqlRequest<Record<string, ConnectionEnvelope<T>>>(
    query,
    variables
  );
  const conn = data?.[resultKey];
  return {
    items: conn?.nodes ?? [],
    hasMore: Boolean(conn?.pageInfo?.hasNextPage),
    endCursor: conn?.pageInfo?.endCursor ?? null,
  };
}

export async function fetchConnectionWindow<T>(
  query: string,
  buildVariables: (
    take: number,
    after: string | null
  ) => Record<string, unknown>,
  resultKey: string,
  opts?: {
    take?: number | null;
    skip?: number | null;
    after?: string | null;
    defaultTake?: number;
  }
): Promise<ConnectionPage<T>> {
  const take = normalizeConnectionTake(opts?.take, opts?.defaultTake);
  const skip = normalizeConnectionSkip(opts?.skip);
  const target = skip + take;
  const collected: T[] = [];
  let after = opts?.after ?? null;
  let hasMore = false;
  let endCursor: string | null = null;

  while (collected.length < target) {
    const page = await fetchConnectionPage<T>(
      query,
      buildVariables(
        Math.min(CONNECTION_MAX_TAKE, target - collected.length),
        after
      ),
      resultKey
    );

    collected.push(...page.items);
    hasMore = page.hasMore;
    endCursor = page.endCursor;

    if (!page.hasMore || !page.endCursor || page.items.length === 0) {
      break;
    }
    after = page.endCursor;
  }

  return {
    items: collected.slice(skip, target),
    hasMore,
    endCursor,
  };
}
