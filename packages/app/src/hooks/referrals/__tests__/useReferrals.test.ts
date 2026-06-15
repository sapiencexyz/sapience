import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const jsonResponse = (
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
): Response => ({ ok, status, json: async () => body }) as unknown as Response;

const STATUS = {
  address: '0xabc',
  refCodeHash: '0xhash',
  maxReferrals: 5,
  referredBy: null,
  referredByCode: null,
  referrals: [{ address: '0xdef', createdAt: '2026-01-01T00:00:00.000Z' }],
};

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchUserReferralStatus', () => {
  it('GETs /referrals/users/:address (lowercased) and returns the body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(STATUS));

    const { fetchUserReferralStatus } = await import('../useReferrals');
    const status = await fetchUserReferralStatus('0xABC');

    expect(status).toEqual(STATUS);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.sapience.xyz/referrals/users/0xabc'
    );
  });

  it('throws a ReferralApiError on a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 500 })
    );

    const { fetchUserReferralStatus, ReferralApiError } = await import(
      '../useReferrals'
    );

    await expect(fetchUserReferralStatus('0xabc')).rejects.toBeInstanceOf(
      ReferralApiError
    );
  });
});

describe('useUserReferrals', () => {
  it('maps the REST status into the { user } envelope the dashboard reads', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(STATUS));

    const { useUserReferrals } = await import('../useReferrals');
    const { result } = renderHook(() => useUserReferrals('0xabc', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    expect(result.current.data?.user).toEqual({
      address: '0xabc',
      refCodeHash: '0xhash',
      maxReferrals: 5,
      referrals: [{ address: '0xdef', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
  });

  it('is disabled until a wallet address is provided', async () => {
    const { useUserReferrals } = await import('../useReferrals');
    renderHook(() => useUserReferrals(null, true), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
