import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequestV2 = vi.fn();

// The position hooks page via `useCursorPagination`, which issues its requests
// through `graphqlRequestV2`. Mock that single transport export.
vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
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

async function getHooks() {
  const mod = await import('../usePositions');
  return {
    usePositionBalances: mod.usePositionBalances,
    usePositionBalancesByConditionId: mod.usePositionBalancesByConditionId,
  };
}

const HOLDER = '0xabc';
const CONDITION_ID = '0xcond';

// A v2 `Position` node (the adapter maps it to a PositionBalance).
const makeNode = (id: string) => ({
  id,
  chainId: 1,
  holder: HOLDER,
  pickConfigId: 'pc1',
  token: '0xtok',
  side: 'PREDICTOR' as const,
  status: 'OPEN' as const,
  balance: '100',
  userCollateral: null,
  totalPayout: null,
  realizedPnl: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  pickConfig: null,
});

// A Relay `PositionConnection` page. Per the v2 contract, an all-synthesized-
// away page still reports an advancing `endCursor` while more raw rows exist,
// so `endCursor` is independent of whether `nodes` is empty.
const conn = (
  nodes: ReturnType<typeof makeNode>[],
  hasNextPage: boolean,
  endCursor: string | null = nodes.length ? `c${nodes.length - 1}` : null
) => ({
  positions: {
    edges: nodes.map((node, i) => ({ node, cursor: `c${i}` })),
    pageInfo: { hasNextPage, endCursor },
    totalCount: nodes.length,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequestV2.mockResolvedValue(conn([], false));
});

describe('usePositionBalances — pagination', () => {
  it('stops paginating when the server reports hasNextPage=false', async () => {
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequestV2
      .mockResolvedValueOnce(conn([makeNode('1')], true))
      .mockResolvedValueOnce(conn([], false));

    const { result } = renderHook(
      () => usePositionBalances({ holder: HOLDER, pageSize: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.fetchMore();
    });
    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('keeps paginating across pages with zero synthesized nodes so long as hasNextPage stays true', async () => {
    // A page can have edges=[] but an advancing endCursor with more raw rows
    // behind it — page on pageInfo, never on node count.
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequestV2
      .mockResolvedValueOnce(conn([], true, 'cursor-after-empty'))
      .mockResolvedValueOnce(conn([makeNode('99')], false));

    const { result } = renderHook(
      () => usePositionBalances({ holder: HOLDER, pageSize: 15 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
    expect(result.current.data.length).toBe(0);

    await act(async () => {
      result.current.fetchMore();
    });
    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('passes a PositionFilter + cursor page args through', async () => {
    const { usePositionBalances } = await getHooks();

    renderHook(
      () =>
        usePositionBalances({
          holder: HOLDER,
          chainId: 42,
          settled: true,
          pageSize: 25,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequestV2.mock.calls[0][1]).toMatchObject({
      filter: { holder: HOLDER, chainId: 42, settled: true },
      first: 25,
      after: null,
    });
  });

  it('omits chainId/settled from the filter when not provided', async () => {
    const { usePositionBalances } = await getHooks();

    renderHook(() => usePositionBalances({ holder: HOLDER }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequestV2.mock.calls[0][1].filter).toEqual({
      holder: HOLDER,
    });
  });

  it('is disabled until a holder is provided', async () => {
    const { usePositionBalances } = await getHooks();

    renderHook(() => usePositionBalances({}), { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequestV2).not.toHaveBeenCalled();
  });
});

describe('usePositionBalancesByConditionId — pagination', () => {
  it('stops paginating when hasNextPage=false (same rule as the holder hook)', async () => {
    const { usePositionBalancesByConditionId } = await getHooks();

    mockGraphqlRequestV2
      .mockResolvedValueOnce(conn([makeNode('1')], true))
      .mockResolvedValueOnce(conn([], false));

    const { result } = renderHook(
      () =>
        usePositionBalancesByConditionId({
          conditionId: CONDITION_ID,
          pageSize: 1,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.fetchMore();
    });
    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(2);
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('filters by conditionIds', async () => {
    const { usePositionBalancesByConditionId } = await getHooks();

    renderHook(
      () => usePositionBalancesByConditionId({ conditionId: CONDITION_ID }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequestV2.mock.calls[0][1].filter).toEqual({
      conditionIds: [CONDITION_ID],
    });
  });
});
