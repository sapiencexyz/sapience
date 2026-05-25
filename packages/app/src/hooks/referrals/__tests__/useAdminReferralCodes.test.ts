import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();

vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

vi.mock('~/hooks/useAdminApi', () => ({
  useAdminApi: () => ({
    base: 'https://api.example/admin',
    sign: vi.fn(),
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const makeRow = (id: number) => ({
  id,
  maxClaims: 5,
  isActive: true,
  expiresAt: null,
  createdBy: '0xabc',
  creatorType: 'admin' as const,
  createdAt: '2026-04-20T00:00:00.000Z',
  claimCount: 0,
  totalVolume: '0',
  totalPositions: 0,
});

const page = (
  items: ReturnType<typeof makeRow>[],
  nextCursor: number | null
) => ({ referralCodes: { items, nextCursor } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAdminReferralCodes — pagination', () => {
  it('returns the single page when nextCursor is null', async () => {
    mockGraphqlRequest.mockResolvedValueOnce(
      page([makeRow(1), makeRow(2)], null)
    );

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.length).toBe(2);
    });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.any(String), {
      limit: 500,
      cursor: null,
    });
  });

  it('follows nextCursor across multiple pages and concatenates results', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce(page([makeRow(10), makeRow(9)], 9))
      .mockResolvedValueOnce(page([makeRow(8), makeRow(7)], 7))
      .mockResolvedValueOnce(page([makeRow(6)], null));

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.map((r) => r.id)).toEqual([10, 9, 8, 7, 6]);
    });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(1, expect.any(String), {
      limit: 500,
      cursor: null,
    });
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(2, expect.any(String), {
      limit: 500,
      cursor: 9,
    });
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(3, expect.any(String), {
      limit: 500,
      cursor: 7,
    });
  });

  it('caps at MAX_PAGES so a non-progressing cursor cannot loop forever', async () => {
    // Server pathologically keeps returning a non-null cursor.
    mockGraphqlRequest.mockResolvedValue(page([makeRow(1)], 1));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    // 50 pages × 1 row each
    expect(result.current.data?.length).toBe(50);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(50);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MAX_PAGES'));
    warn.mockRestore();
  });
});
