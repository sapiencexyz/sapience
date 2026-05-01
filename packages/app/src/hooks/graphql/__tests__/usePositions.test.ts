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

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ positions: [] });
});

describe('usePositionBalances — pagination', () => {
  it('does not paginate further when the next fetch returns an empty page', async () => {
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequest
      .mockResolvedValueOnce({ positions: [makePosition('1')] })
      .mockResolvedValueOnce({ positions: [] });

    const { result } = renderHook(
      () => usePositionBalances({ holder: HOLDER, pageSize: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    // Page 0 returned 1 (== pageSize) → still hasMore.
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.fetchMore();
    });
    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    });

    // Page 1 returned 0 → done. Stops further paging.
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps paginating when the API returns fewer rows than pageSize', async () => {
    // Synthesized event-stream rows mean returned count != raw page size,
    // so a partial page is NOT a stop signal — only an empty one is.
    const { usePositionBalances } = await getHooks();

    mockGraphqlRequest.mockResolvedValueOnce({
      positions: [makePosition('1')],
    });

    const { result } = renderHook(
      () => usePositionBalances({ holder: HOLDER, pageSize: 50 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    expect(result.current.hasMore).toBe(true);
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
      holder: HOLDER,
      chainId: 42,
      settled: true,
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
  it('stops on empty page using the same rule as the holder hook', async () => {
    const { usePositionBalancesByConditionId } = await getHooks();

    mockGraphqlRequest
      .mockResolvedValueOnce({ positions: [makePosition('1')] })
      .mockResolvedValueOnce({ positions: [] });

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
