import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
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

const makePosition = (id: string) => ({
  id,
  chainId: 1,
  tokenAddress: '0xtok',
  pickConfigId: 'pc1',
  isPredictorToken: true,
  holder: HOLDER,
  balance: '100',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  pickConfig: null,
});

const page = (items: ReturnType<typeof makePosition>[], hasMore: boolean) => ({
  positionsPage: { items, hasMore },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue(page([], false));
});

describe('usePositionBalances — pagination', () => {
  it('stops paginating when the server reports hasMore=false', async () => {
    // Server-truth: synthesized item count is unreliable (zero-balance
    // unresolved positions with no sells produce empty pages). Trust
    // hasMore from the API.
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequest
      .mockResolvedValueOnce(page([makePosition('1')], true))
      .mockResolvedValueOnce(page([], false));

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
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('keeps paginating across pages with zero synthesized items so long as the server still reports more', async () => {
    // The whole point of moving to server-truth pagination: a page can
    // have items=[] but more raw rows behind it.
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequest
      .mockResolvedValueOnce(page([], true)) // empty synthesized page, more raw rows behind
      .mockResolvedValueOnce(page([makePosition('99')], false));

    const { result } = renderHook(
      () => usePositionBalances({ holder: HOLDER, pageSize: 15 }),
      { wrapper: createWrapper() }
    );

    // Empty synthesized page, but hasMore=true means we should still fetch.
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

  it('passes holder/chainId/settled/pagination params through', async () => {
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
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      filters: { holder: HOLDER, chainId: 42, settled: true },
      take: 25,
      skip: 0,
    });
  });

  it('is disabled until a holder is provided', async () => {
    const { usePositionBalances } = await getHooks();

    renderHook(() => usePositionBalances({}), { wrapper: createWrapper() });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });
});

describe('usePositionBalancesByConditionId — pagination', () => {
  it('stops paginating when hasMore=false (same rule as the holder hook)', async () => {
    const { usePositionBalancesByConditionId } = await getHooks();

    mockGraphqlRequest
      .mockResolvedValueOnce(page([makePosition('1')], true))
      .mockResolvedValueOnce(page([], false));

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
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    });
    expect(result.current.hasMore).toBe(false);
  });
});
