import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

// The hook uses the GraphQL transport (/v2/graphql) — mock that symbol.
vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

// One client per test, torn down in afterEach so an in-flight fetchNextPage
// from a prior test cannot resolve into the next test's mock queue.
let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

async function getHook() {
  const mod = await import('./useCursorPagination');
  return mod.useCursorPagination;
}

type Node = { id: string; name: string };

const node = (id: string): Node => ({ id, name: `n${id}` });

// A forward-only Relay connection page, keyed under `things`.
const conn = (
  nodes: Node[],
  hasNextPage: boolean,
  endCursor: string | null = nodes.length ? `cursor:${nodes.at(-1)!.id}` : null
) => ({
  things: {
    edges: nodes.map((n) => ({ node: n, cursor: `cursor:${n.id}` })),
    pageInfo: { hasNextPage, endCursor },
    totalCount: 99,
  },
});

const QUERY = /* GraphQL */ `
  query Things($first: Int!, $after: String) {
    things(first: $first, after: $after) {
      edges {
        node {
          id
          name
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue(conn([], false));
});

afterEach(() => {
  // Unmount hooks and cancel any in-flight queries so a late-resolving
  // fetchNextPage can't consume the next test's mockResolvedValueOnce.
  cleanup();
  queryClient?.clear();
});

describe('useCursorPagination', () => {
  it('accumulates nodes from edges[].node across pages', async () => {
    const useCursorPagination = await getHook();

    mockGraphqlRequest.mockImplementation(
      (_query: string, vars: { after: string | null }) =>
        Promise.resolve(
          vars.after
            ? conn([node('3')], false)
            : conn([node('1'), node('2')], true)
        )
    );

    const { result } = renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['accumulates'],
          query: QUERY,
          connectionKey: 'things',
          pageSize: 2,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.map((n) => n.id)).toEqual(['1', '2']);
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.data.map((n) => n.id)).toEqual(['1', '2', '3']);
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('forwards the previous page endCursor as `after` on loadMore', async () => {
    const useCursorPagination = await getHook();

    // Drive the mock by the `after` argument rather than call order so a
    // stray late-resolving fetch can't desync a Once queue.
    mockGraphqlRequest.mockImplementation(
      (_query: string, vars: { after: string | null }) =>
        Promise.resolve(
          vars.after === 'CURSOR_A'
            ? conn([node('2')], false, 'CURSOR_B')
            : conn([node('1')], true, 'CURSOR_A')
        )
    );

    const { result } = renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['forwards'],
          query: QUERY,
          connectionKey: 'things',
          pageSize: 1,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.map((n) => n.id)).toEqual(['1']);
    });
    // First page: no cursor.
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      first: 1,
      after: null,
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.data.map((n) => n.id)).toEqual(['1', '2']);
    });
    // Second page threaded the first page's endCursor as `after`.
    const secondCall = mockGraphqlRequest.mock.calls.find(
      (c) => (c[1] as { after: string | null }).after === 'CURSOR_A'
    );
    expect(secondCall).toBeDefined();
  });

  it('exposes hasNextPage and totalCount from pageInfo', async () => {
    const useCursorPagination = await getHook();

    mockGraphqlRequest.mockResolvedValue(conn([node('1')], true));

    const { result } = renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['exposes'],
          query: QUERY,
          connectionKey: 'things',
          pageSize: 1,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.totalCount).toBe(99);
  });

  it('does not fetch a further page when hasNextPage is false', async () => {
    const useCursorPagination = await getHook();

    mockGraphqlRequest.mockResolvedValue(conn([node('1')], false));

    const { result } = renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['exhausted'],
          query: QUERY,
          connectionKey: 'things',
          pageSize: 1,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.hasNextPage).toBe(false);

    const callsAfterFirstPage = mockGraphqlRequest.mock.calls.length;
    await act(async () => {
      result.current.loadMore();
    });
    // Give a tick; loadMore should be a no-op when exhausted.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequest.mock.calls.length).toBe(callsAfterFirstPage);
  });

  it('merges caller variables into each request', async () => {
    const useCursorPagination = await getHook();

    mockGraphqlRequest.mockResolvedValueOnce(conn([node('1')], false));

    renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['merges', 'base'],
          query: QUERY,
          connectionKey: 'things',
          pageSize: 5,
          variables: { address: '0xabc', settled: true },
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      address: '0xabc',
      settled: true,
      first: 5,
      after: null,
    });
  });

  it('is disabled until enabled is true', async () => {
    const useCursorPagination = await getHook();

    renderHook(
      () =>
        useCursorPagination<Node>({
          queryKey: ['disabled'],
          query: QUERY,
          connectionKey: 'things',
          enabled: false,
        }),
      { wrapper: createWrapper() }
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });
});
