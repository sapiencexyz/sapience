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

export async function graphqlRequest<TData>(
  graphqlUrl: string,
  query: string,
  variables: Record<string, unknown>,
  label: string
): Promise<TData> {
  const response = await fetchWithRetry(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable body)');
    throw new Error(
      `[${label}] GraphQL query failed: HTTP ${response.status} ${response.statusText}\nResponse body: ${body.slice(0, 2000)}`
    );
  }

  const result = (await response.json()) as {
    data?: TData;
    errors?: Array<{ message: string }>;
  };
  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `[${label}] GraphQL query returned errors: ${result.errors.map((e) => e.message).join('; ')}`
    );
  }
  if (result.data == null) {
    throw new Error(`[${label}] GraphQL response carried no data`);
  }
  return result.data;
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
