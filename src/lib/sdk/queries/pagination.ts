export const GRAPHQL_PAGE_SIZE = 25;
export const DEFAULT_MAX_PAGES = 500; // safety against infinite cursors

export type PageInfo = { hasNextPage: boolean; endCursor: string | null };
export type ConnectionLike<TNode> = { nodes?: TNode[]; pageInfo?: PageInfo };

/**
 * Walks a Relay connection page-by-page. Return `false` from `onPage` to stop
 * early without fetching further pages.
 */
export async function walkConnection<TNode>(opts: {
  fetchPage: (args: {
    first: number;
    after: string | null;
  }) => Promise<ConnectionLike<TNode>>;
  pageSize?: number;
  maxPages?: number;
  onPage: (nodes: TNode[]) => boolean | void;
}): Promise<void> {
  const pageSize = opts.pageSize ?? GRAPHQL_PAGE_SIZE;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  let after: string | null = null;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    if (pageCount > maxPages) {
      throw new Error(
        `walkConnection exceeded maxPages (${maxPages}); possible infinite cursor loop`
      );
    }

    const connection = await opts.fetchPage({ first: pageSize, after });
    const pageNodes = connection.nodes ?? [];
    if (opts.onPage(pageNodes) === false) return;

    const pageInfo = connection.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) return;
    after = pageInfo.endCursor;
  }
}

/**
 * Walks a Relay connection to exhaustion (or maxNodes/maxPages).
 */
export async function paginateConnection<TNode>(opts: {
  fetchPage: (args: {
    first: number;
    after: string | null;
  }) => Promise<ConnectionLike<TNode>>;
  pageSize?: number;
  maxPages?: number;
  maxNodes?: number;
}): Promise<TNode[]> {
  const allNodes: TNode[] = [];
  await walkConnection({
    fetchPage: opts.fetchPage,
    pageSize: opts.pageSize,
    maxPages: opts.maxPages,
    onPage: (pageNodes) => {
      allNodes.push(...pageNodes);
      if (opts.maxNodes !== undefined && allNodes.length >= opts.maxNodes) {
        return false;
      }
    },
  });
  return opts.maxNodes !== undefined
    ? allNodes.slice(0, opts.maxNodes)
    : allNodes;
}
