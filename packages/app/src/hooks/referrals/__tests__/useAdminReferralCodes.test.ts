import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const okResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response;

const errResponse = (status: number, body: unknown): Response =>
  ({
    ok: false,
    status,
    json: async () => body,
  }) as unknown as Response;

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAdminReferralCodes', () => {
  it('GETs /referrals/codes and returns items', async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ items: [makeRow(2), makeRow(1)] })
    );

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.map((r) => r.id)).toEqual([2, 1]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example/referrals/codes'
    );
  });

  it('surfaces an Error with the server message on a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(errResponse(500, { message: 'boom' }));

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    expect((result.current.error as Error).message).toBe('boom');
  });
});

describe('useAdminReferralCodeAnalytics', () => {
  it('GETs /referrals/codes/:id and returns the analytics payload', async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        id: 7,
        claimCount: 2,
        totalVolume: '500',
        totalPositions: 3,
        claimants: [{ address: '0xa', tradingVolume: '300', positionCount: 2 }],
      })
    );

    const { useAdminReferralCodeAnalytics } = await import(
      '../useAdminReferralCodes'
    );
    const { result } = renderHook(() => useAdminReferralCodeAnalytics(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.id).toBe(7);
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example/referrals/codes/7'
    );
    expect(result.current.data?.claimants).toEqual([
      { address: '0xa', tradingVolume: '300', positionCount: 2 },
    ]);
  });

  it('is disabled when id is undefined', async () => {
    const { useAdminReferralCodeAnalytics } = await import(
      '../useAdminReferralCodes'
    );
    const { result } = renderHook(
      () => useAdminReferralCodeAnalytics(undefined),
      {
        wrapper: createWrapper(),
      }
    );

    // Give the query a tick to run if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
