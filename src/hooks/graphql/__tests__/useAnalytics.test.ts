import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';

const mockFetchProtocolAnalytics = vi.fn();
const mockFetchProtocolStats = vi.fn();
const mockFetchVaultStats = vi.fn();
const mockFetchVaultAccountValue = vi.fn();

vi.mock('~/lib/sdk/queries', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchProtocolAnalytics: (...args: unknown[]) =>
      mockFetchProtocolAnalytics(...args),
    fetchProtocolStats: (...args: unknown[]) => mockFetchProtocolStats(...args),
    fetchVaultStats: (...args: unknown[]) => mockFetchVaultStats(...args),
    fetchVaultAccountValue: (...args: unknown[]) =>
      mockFetchVaultAccountValue(...args),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  const wrapper = function Wrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
  return { wrapper, queryClient };
}

async function getModule() {
  return import('../useAnalytics');
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const stat = {
  timestamp: 1750000000,
  cumulativeVolume: '5000000000000000000000',
  cumulativeTradeCount: 42,
  periodVolume: '100000000000000000000',
  periodTradeCount: 3,
  openInterest: '2000000000000000000000',
  escrowBalance: '1500000000000000000000',
  totalValueLocked: '3000000000000000000000',
};

const analytics = {
  stats: stat,
  statsHistory: [stat],
  openInterestByCategory: [],
  openInterestByTimeToResolution: [],
};

const vaultStat = {
  timestamp: 1750000000,
  balance: '1000000000000000000',
  deployedCollateral: '0',
  undeployedCollateral: '0',
  cumulativePnl: '0',
  claimableCollateral: '0',
};

const vaultAccountValue = {
  collateralBalance: '1000000000000000000',
  deployedCollateral: '2000000000000000000',
  claimableCollateral: '0',
  totalValue: '3000000000000000000',
  timestamp: 1750000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchProtocolAnalytics.mockResolvedValue(analytics);
  mockFetchProtocolStats.mockResolvedValue(stat);
  mockFetchVaultStats.mockResolvedValue([vaultStat]);
  mockFetchVaultAccountValue.mockResolvedValue(vaultAccountValue);
});

// ─── useProtocolAnalytics ────────────────────────────────────────────────────

describe('useProtocolAnalytics', () => {
  it('returns the analytics payload from the fetcher', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useProtocolAnalytics(), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(analytics);
    expect(mockFetchProtocolAnalytics).toHaveBeenCalledTimes(1);
    // The protocol query takes no arguments.
    expect(mockFetchProtocolAnalytics).toHaveBeenCalledWith();
  });

  it('surfaces fetcher failures as an error state', async () => {
    mockFetchProtocolAnalytics.mockRejectedValue(new Error('boom'));

    const mod = await getModule();
    const { result } = renderHook(() => mod.useProtocolAnalytics(), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe('boom');
  });
});

// ─── useProtocolStats ────────────────────────────────────────────────────────

describe('useProtocolStats', () => {
  it('returns the live stats from the fetcher', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useProtocolStats(), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stat);
    expect(mockFetchProtocolStats).toHaveBeenCalledTimes(1);
  });

  it('surfaces fetcher failures as an error state', async () => {
    mockFetchProtocolStats.mockRejectedValue(new Error('stats down'));

    const mod = await getModule();
    const { result } = renderHook(() => mod.useProtocolStats(), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ─── useVaultStats ───────────────────────────────────────────────────────────

describe('useVaultStats', () => {
  it('fetches vault stats with the address and default chain id', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultStats('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([vaultStat]);
    expect(mockFetchVaultStats).toHaveBeenCalledTimes(1);
    expect(mockFetchVaultStats).toHaveBeenCalledWith(
      '0xVault',
      DEFAULT_CHAIN_ID,
      expect.objectContaining({
        // First load: nothing cached yet to refetch incrementally from.
        baseline: undefined,
      })
    );
  });

  it('publishes nothing until the whole page walk resolves', async () => {
    // Mid-walk partials would repaint the chart once per page-batch, which
    // reads as choppy re-layout rather than a series loading. One publish.
    const older = { ...vaultStat, timestamp: vaultStat.timestamp - 3600 };
    let releaseFinal: (() => void) | undefined;
    mockFetchVaultStats.mockImplementation(
      (_addr: string, _chain: number, opts: Record<string, unknown>) => {
        expect(opts.onProgress).toBeUndefined();
        return new Promise((resolve) => {
          releaseFinal = () => resolve([older, vaultStat]);
        });
      }
    );

    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultStats('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    // Newest pages have landed inside the fetcher, but consumers stay on the
    // loading state — there is no partial series to render.
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.data).toBeUndefined();

    releaseFinal?.();
    await waitFor(() =>
      expect(result.current.data).toEqual([older, vaultStat])
    );
  });

  it('stays disabled and never fetches without an address', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultStats(undefined), {
      wrapper: createWrapper().wrapper,
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetchVaultStats).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces fetcher failures as an error state', async () => {
    mockFetchVaultStats.mockRejectedValue(new Error('vault down'));

    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultStats('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('never baselines from a walk that died mid-flight', async () => {
    // A failed walk covered only the newest pages. Its coverage must not seed
    // the next fetch's baseline — the missing head would be treated as
    // already-fetched and the hole would persist across refetches.
    mockFetchVaultStats.mockImplementationOnce(async () => {
      throw new Error('walk died');
    });

    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultStats('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Nothing was published mid-walk, so there is no truncated series to
    // render as complete data.
    expect(result.current.data).toBeUndefined();

    // Retry (beforeEach default resolves [vaultStat]): no completed fetch
    // yet, so no baseline — a full walk re-fetches everything.
    await result.current.refetch();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchVaultStats.mock.calls[1][2]).toMatchObject({
      baseline: undefined,
    });

    // After a completed fetch, the NEXT refetch baselines from its result.
    await result.current.refetch();
    expect(mockFetchVaultStats.mock.calls[2][2].baseline).toEqual([vaultStat]);
  });

  it('lowercases the address in the queryKey so 0xABC and 0xabc dedupe', async () => {
    const mod = await getModule();
    const { wrapper } = createWrapper();

    const upper = renderHook(() => mod.useVaultStats('0xABC'), { wrapper });
    await waitFor(() => expect(upper.result.current.isSuccess).toBe(true));

    // Same client + same (lowercased) key: served from cache within staleTime,
    // no second network call.
    const lower = renderHook(() => mod.useVaultStats('0xabc'), { wrapper });
    await waitFor(() => expect(lower.result.current.isSuccess).toBe(true));

    expect(mockFetchVaultStats).toHaveBeenCalledTimes(1);
    expect(lower.result.current.data).toEqual([vaultStat]);
  });
});

// ─── useVaultAccountValue ────────────────────────────────────────────────────

describe('useVaultAccountValue', () => {
  it('fetches the indexed account value with the address and default chain id', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultAccountValue('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(vaultAccountValue);
    expect(mockFetchVaultAccountValue).toHaveBeenCalledTimes(1);
    expect(mockFetchVaultAccountValue).toHaveBeenCalledWith(
      '0xVault',
      DEFAULT_CHAIN_ID
    );
  });

  it('stays disabled and never fetches without an address', async () => {
    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultAccountValue(undefined), {
      wrapper: createWrapper().wrapper,
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetchVaultAccountValue).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('lowercases the address in the queryKey so 0xDEF and 0xdef dedupe', async () => {
    const mod = await getModule();
    const { wrapper } = createWrapper();

    const upper = renderHook(() => mod.useVaultAccountValue('0xDEF'), {
      wrapper,
    });
    await waitFor(() => expect(upper.result.current.isSuccess).toBe(true));

    const lower = renderHook(() => mod.useVaultAccountValue('0xdef'), {
      wrapper,
    });
    await waitFor(() => expect(lower.result.current.isSuccess).toBe(true));

    expect(mockFetchVaultAccountValue).toHaveBeenCalledTimes(1);
  });

  it('surfaces fetcher failures as an error state', async () => {
    mockFetchVaultAccountValue.mockRejectedValue(new Error('account down'));

    const mod = await getModule();
    const { result } = renderHook(() => mod.useVaultAccountValue('0xVault'), {
      wrapper: createWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
