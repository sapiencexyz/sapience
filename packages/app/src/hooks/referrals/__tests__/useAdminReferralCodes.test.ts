import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// useAdminApi.base ends in `/admin`; the read hooks strip that to derive the
// API root, so reads hit `https://api.example/referrals/*`.
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

const makeClaimant = (n: number) => ({
  address: `0x${n.toString(16).padStart(40, '0')}`,
  tradingVolume: '0',
  positionCount: 0,
});

const jsonResponse = (
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
): Response => ({ ok, status, json: async () => body }) as unknown as Response;

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAdminReferralCodes', () => {
  it('returns every code from a single GET /referrals/codes', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [makeRow(1), makeRow(2)] })
    );

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data?.length).toBe(2);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example/referrals/codes'
    );
  });

  it('tolerates a missing items array', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([]);
    });
  });

  it('surfaces a non-ok response as an error', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 500 })
    );

    const { useAdminReferralCodes } = await import('../useAdminReferralCodes');
    const { result } = renderHook(() => useAdminReferralCodes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useAdminReferralCodeAnalytics', () => {
  it('returns one code analytics from GET /referrals/codes/:id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        claimCount: 3,
        totalVolume: '123',
        totalPositions: 7,
        claimants: [makeClaimant(1), makeClaimant(2)],
      })
    );

    const { useAdminReferralCodeAnalytics } = await import(
      '../useAdminReferralCodes'
    );
    const { result } = renderHook(() => useAdminReferralCodeAnalytics(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    expect(result.current.data?.totalVolume).toBe('123');
    expect(result.current.data?.claimants.length).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example/referrals/codes/1'
    );
  });

  it('throws "Referral code not found" on a 404', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { message: 'Referral code not found' },
        {
          ok: false,
          status: 404,
        }
      )
    );

    const { useAdminReferralCodeAnalytics } = await import(
      '../useAdminReferralCodes'
    );
    const { result } = renderHook(() => useAdminReferralCodeAnalytics(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe('Referral code not found');
  });

  it('is disabled until an id is provided', async () => {
    const { useAdminReferralCodeAnalytics } = await import(
      '../useAdminReferralCodes'
    );
    renderHook(() => useAdminReferralCodeAnalytics(undefined), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
