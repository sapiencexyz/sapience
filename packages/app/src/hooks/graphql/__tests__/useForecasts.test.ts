import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---- mocks ----
// Fully mock the SDK queries module (no importActual) so a stale SDK dist
// can't leak the old implementations into these tests.

const mockFetchForecasts = vi.fn();
const mockFetchForecastsPage = vi.fn();
const mockFetchUserForecasts = vi.fn();

vi.mock('@sapience/sdk/queries', () => ({
  fetchForecasts: (...args: unknown[]) => mockFetchForecasts(...args),
  fetchForecastsPage: (...args: unknown[]) => mockFetchForecastsPage(...args),
  fetchUserForecasts: (...args: unknown[]) => mockFetchUserForecasts(...args),
  generateForecastsQueryKey: (params: {
    schemaId?: string;
    attesterAddress?: string;
    chainId?: number;
    conditionId?: string;
  }) => [
    'attestations',
    params.schemaId ?? 'default-schema',
    params.attesterAddress || null,
    params.chainId || null,
    params.conditionId || null,
  ],
}));

// ---- helpers ----

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

function makeFormatted(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id: uid, // identity: EAS uid, no numeric row id
    uid,
    attester: '0x1234567890abcdef1234567890abcdef12345678',
    shortAttester: '0x1234...5678',
    value: '750000000000000000',
    comment: '',
    time: 'formatted',
    rawTime: 1700000000,
    conditionId: '0xcond1',
    ...overrides,
  };
}

const page = (
  uids: string[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
) => ({
  items: uids.map((u) => makeFormatted(u)),
  pageInfo,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// useForecasts
// ============================================================================

describe('useForecasts', () => {
  it('returns the SDK-formatted rows straight through', async () => {
    mockFetchForecasts.mockResolvedValue([
      makeFormatted('0xa'),
      makeFormatted('0xb'),
    ]);
    const { useForecasts } = await import('../useForecasts');

    const { result } = renderHook(
      () => useForecasts({ attesterAddress: '0xabc' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.map((f) => f.uid)).toEqual(['0xa', '0xb']);
    expect(result.current.data[0].id).toBe('0xa');
  });

  it('forwards schemaId / attesterAddress / conditionId to the SDK fetcher', async () => {
    mockFetchForecasts.mockResolvedValue([]);
    const { useForecasts } = await import('../useForecasts');

    renderHook(
      () =>
        useForecasts({
          schemaId: '0xschema',
          attesterAddress: '0xabc',
          conditionId: '0xcond',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(mockFetchForecasts).toHaveBeenCalledTimes(1));
    expect(mockFetchForecasts).toHaveBeenCalledWith({
      schemaId: '0xschema',
      attesterAddress: '0xabc',
      conditionId: '0xcond',
    });
  });

  it('returns an empty list before any data arrives', async () => {
    mockFetchForecasts.mockResolvedValue([]);
    const { useForecasts } = await import('../useForecasts');

    const { result } = renderHook(() => useForecasts({}), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});

// ============================================================================
// useInfiniteForecasts
// ============================================================================

describe('useInfiniteForecasts', () => {
  it('fetches page one with no cursor and flattens items', async () => {
    mockFetchForecastsPage.mockResolvedValue(
      page(['0xa', '0xb'], { hasNextPage: false, endCursor: null })
    );
    const { useInfiniteForecasts } = await import('../useForecasts');

    const { result } = renderHook(
      () => useInfiniteForecasts({ conditionId: '0xcond' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const [params, pageArgs] = mockFetchForecastsPage.mock.calls[0];
    expect(params).toMatchObject({ conditionId: '0xcond' });
    expect(pageArgs.first).toBe(10);
    expect(pageArgs.after ?? null).toBeNull();

    expect(result.current.data.map((f) => f.uid)).toEqual(['0xa', '0xb']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('threads pageInfo.endCursor as after for the next page', async () => {
    mockFetchForecastsPage
      .mockResolvedValueOnce(
        page(['0xa'], { hasNextPage: true, endCursor: 'cursor-1' })
      )
      .mockResolvedValueOnce(
        page(['0xb'], { hasNextPage: false, endCursor: null })
      );
    const { useInfiniteForecasts } = await import('../useForecasts');

    const { result } = renderHook(() => useInfiniteForecasts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(mockFetchForecastsPage).toHaveBeenCalledTimes(2)
    );
    const [, secondPageArgs] = mockFetchForecastsPage.mock.calls[1];
    expect(secondPageArgs.after).toBe('cursor-1');

    expect(result.current.data.map((f) => f.uid)).toEqual(['0xa', '0xb']);
    expect(result.current.hasNextPage).toBe(false);
  });
});

// ============================================================================
// useUserForecasts
// ============================================================================

describe('useUserForecasts', () => {
  it('does not fetch without an attester address', async () => {
    const { useUserForecasts } = await import('../useForecasts');

    renderHook(
      () =>
        useUserForecasts({
          attesterAddress: '',
          orderDirection: 'desc',
        }),
      { wrapper: createWrapper() }
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetchUserForecasts).not.toHaveBeenCalled();
  });

  it('fetches the first page with first/orderDirection and no cursor', async () => {
    mockFetchUserForecasts.mockResolvedValue(
      page(['0xa'], { hasNextPage: false, endCursor: null })
    );
    const { useUserForecasts } = await import('../useForecasts');

    const { result } = renderHook(
      () =>
        useUserForecasts({
          attesterAddress: '0xabc',
          pageSize: 20,
          orderDirection: 'desc',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchUserForecasts).toHaveBeenCalledTimes(1);
    const [args] = mockFetchUserForecasts.mock.calls[0];
    expect(args).toMatchObject({
      attesterAddress: '0xabc',
      first: 20,
      orderDirection: 'desc',
    });
    expect(args.after ?? null).toBeNull();
    expect(args).not.toHaveProperty('skip');

    expect(result.current.data.map((f) => f.uid)).toEqual(['0xa']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('accumulates pages via the endCursor', async () => {
    mockFetchUserForecasts
      .mockResolvedValueOnce(
        page(['0xa', '0xb'], { hasNextPage: true, endCursor: 'cursor-2' })
      )
      .mockResolvedValueOnce(
        page(['0xc'], { hasNextPage: false, endCursor: null })
      );
    const { useUserForecasts } = await import('../useForecasts');

    const { result } = renderHook(
      () =>
        useUserForecasts({
          attesterAddress: '0xabc',
          pageSize: 2,
          orderDirection: 'desc',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(mockFetchUserForecasts).toHaveBeenCalledTimes(2)
    );
    const [secondArgs] = mockFetchUserForecasts.mock.calls[1];
    expect(secondArgs.after).toBe('cursor-2');

    expect(result.current.data.map((f) => f.uid)).toEqual([
      '0xa',
      '0xb',
      '0xc',
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });
});
