/**
 * Transport helpers for the Sapience GraphQL API (served at `/v2/graphql`).
 *
 * The API is relay-shaped: list fields return connections with
 * `nodes` + `pageInfo { hasNextPage, endCursor }` and paginate with
 * `(first, after)` instead of v1's Prisma-style `(take, skip)`.
 * `walkConnection` owns that loop so each cron only supplies its query,
 * a connection selector, and an onPage callback (return `false` to stop
 * early — used by walks that read an ordered prefix, e.g. cleanup's
 * openInterest-ascending scan).
 */

import {
  GRAPHQL_PAGE_SIZE,
  walkConnection as sdkWalkConnection,
  type PageInfo,
} from '@sapience/sdk/queries';

import { fetchWithRetry } from './fetch';

export { GRAPHQL_PAGE_SIZE };
export type { PageInfo };

export function graphqlUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '') + '/v2/graphql';
}

export type Connection<TNode> = {
  nodes: TNode[];
  pageInfo: PageInfo;
};

/**
 * GraphQL-level errors ride back as HTTP 200 with an `errors` array, so
 * `fetchWithRetry` (which only retries 429/5xx/network failures) never
 * sees them. Transient server-side errors — the API's 8s Prisma query
 * timeout, connection-pool exhaustion — must be retried here instead:
 * the underlying Postgres query keeps running after the API stops
 * waiting, so a retry lands on a warm cache and typically succeeds.
 */
type GraphqlResponseError = {
  message: string;
  extensions?: { code?: string };
};

/**
 * Structured error codes the API stamps on transient failures
 * (`extensions.code` on the GraphQL error). Preferred over message
 * matching — the API can reword messages without breaking retries.
 */
const TRANSIENT_GRAPHQL_ERROR_CODES = new Set(['QUERY_TIMEOUT']);

/**
 * Message-based fallback for errors that carry no structured code —
 * Prisma-internal wording (connection pool exhaustion) and older API
 * deployments that predate `extensions.code`.
 */
const TRANSIENT_GRAPHQL_ERROR_PATTERNS = [
  /query timeout/i,
  /timed out fetching a new connection/i,
  /connection pool/i,
];

function isTransientGraphqlError(errors: GraphqlResponseError[]): boolean {
  return errors.some(
    (e) =>
      (e.extensions?.code != null &&
        TRANSIENT_GRAPHQL_ERROR_CODES.has(e.extensions.code)) ||
      TRANSIENT_GRAPHQL_ERROR_PATTERNS.some((p) => p.test(e.message))
  );
}

/**
 * Inner HTTP retry budget. `fetchWithRetry` defaults to maxRetries=10
 * (~17 minutes of exponential backoff worst case); compounded with this
 * module's own transient-error retry loop that would balloon to 60+
 * HTTP attempts inside cron jobs. Capping the inner budget bounds a
 * single graphqlRequest to a few seconds of HTTP-level backoff while
 * the outer loop keeps handling transient GraphQL errors.
 */
const HTTP_MAX_RETRIES = 2;

export async function graphqlRequest<TData>(
  graphqlUrl: string,
  query: string,
  variables: Record<string, unknown>,
  label: string,
  retryOpts?: { maxRetries?: number; baseDelayMs?: number }
): Promise<TData> {
  const maxRetries = retryOpts?.maxRetries ?? 5;
  const baseDelayMs = retryOpts?.baseDelayMs ?? 1000;

  for (let attempt = 0; ; attempt++) {
    const response = await fetchWithRetry(
      graphqlUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      },
      HTTP_MAX_RETRIES
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable body)');
      throw new Error(
        `[${label}] GraphQL query failed: HTTP ${response.status} ${response.statusText}\nResponse body: ${body.slice(0, 2000)}`
      );
    }

    const result = (await response.json()) as {
      data?: TData;
      errors?: GraphqlResponseError[];
    };
    if (result.errors && result.errors.length > 0) {
      const joined = result.errors.map((e) => e.message).join('; ');
      if (attempt < maxRetries && isTransientGraphqlError(result.errors)) {
        const delay =
          baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs;
        console.log(
          `[Retry] [${label}] Transient GraphQL error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries}) — ${joined}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(`[${label}] GraphQL query returned errors: ${joined}`);
    }
    if (result.data == null) {
      throw new Error(`[${label}] GraphQL response carried no data`);
    }
    return result.data;
  }
}

export async function walkConnection<TNode, TData>(opts: {
  graphqlUrl: string;
  query: string;
  /** Extra variables merged alongside `first` / `after`. */
  variables?: Record<string, unknown>;
  pageSize?: number;
  label: string;
  select: (data: TData) => Connection<TNode>;
  /** Called per page; return `false` to stop paginating. */
  onPage: (nodes: TNode[]) => boolean | void;
}): Promise<void> {
  return sdkWalkConnection({
    pageSize: opts.pageSize,
    fetchPage: ({ first, after }) =>
      graphqlRequest<TData>(
        opts.graphqlUrl,
        opts.query,
        { ...opts.variables, first, after },
        opts.label
      ).then(opts.select),
    onPage: opts.onPage,
  });
}
