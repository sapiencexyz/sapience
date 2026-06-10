import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type {
  PickConfigurationCondition,
  PickConfigurationResult,
} from '@sapience/sdk/queries';

// ---- mocks ----

const mockFetchPickConfigurations = vi.fn();

vi.mock('@sapience/sdk/queries', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@sapience/sdk/queries'
  );
  return {
    ...actual,
    fetchPickConfigurations: (...args: unknown[]) =>
      mockFetchPickConfigurations(...args),
  };
});

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

function makeCondition(
  overrides: Partial<PickConfigurationCondition> & { id: string }
): PickConfigurationCondition {
  return {
    shortName: null,
    question: 'Test?',
    description: null,
    endTime: Date.now() / 1000 + 86400,
    resolver: null,
    category: null,
    settled: false,
    resolvedToYes: false,
    nonDecisive: false,
    estimatedPrice: 0.5,
    ...overrides,
  };
}

function makePick(
  conditionId: string,
  conditionOverrides: Partial<PickConfigurationCondition> = {}
): PickConfigurationResult['picks'][number] {
  return {
    conditionId,
    conditionResolver: `r-${conditionId}`,
    predictedOutcome: 1,
    condition: makeCondition({ id: conditionId, ...conditionOverrides }),
  };
}

function makeConfig(
  overrides: Partial<PickConfigurationResult> & { id: string }
): PickConfigurationResult {
  return {
    chainId: 1,
    totalPredictorCollateral: '1000',
    totalCounterpartyCollateral: '1000',
    resolved: false,
    picks: [makePick('c1'), makePick('c2')],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPickConfigurations.mockResolvedValue([]);
});

// ---- import after mocks ----

async function getHook() {
  const mod = await import('../useRecentCombos');
  return mod.useRecentCombos;
}

describe('useRecentCombos', () => {
  it('passes resolved: false and take: 50 to fetchPickConfigurations', async () => {
    const useRecentCombos = await getHook();

    const configs = [makeConfig({ id: 'pc1' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchPickConfigurations).toHaveBeenCalled();
    });

    const callArgs = mockFetchPickConfigurations.mock.calls[0][0];
    expect(callArgs).toEqual(
      expect.objectContaining({ take: 50, resolved: false })
    );
  });

  it('filters to only multi-leg (2+ picks) configs', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({ id: 'single', picks: [makePick('c1')] }),
      makeConfig({ id: 'multi' }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].pickConfigId).toBe('multi');
  });

  it('deduplicates by condition set', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({ id: 'pc1' }),
      makeConfig({ id: 'pc2' }), // same condition set as pc1
      makeConfig({
        id: 'pc3',
        picks: [makePick('c3'), makePick('c4')],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(2);
    });

    expect(result.current.combos.map((c) => c.pickConfigId)).toEqual([
      'pc1',
      'pc3',
    ]);
  });

  it('filters out combos where any condition is settled: true', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({
        id: 'settled-combo',
        picks: [makePick('c1', { settled: true }), makePick('c2')],
      }),
      makeConfig({
        id: 'active-combo',
        picks: [makePick('c3'), makePick('c4')],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].pickConfigId).toBe('active-combo');
  });

  it('filters out combos where any condition has estimatedPrice < 0.01', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({
        id: 'low-price',
        picks: [
          makePick('c1', { estimatedPrice: 0.005 }),
          makePick('c2', { estimatedPrice: 0.5 }),
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchPickConfigurations).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.combos).toEqual([]);
    });
  });

  it('filters out combos where any condition has estimatedPrice > 0.99', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({
        id: 'high-price',
        picks: [
          makePick('c1', { estimatedPrice: 0.5 }),
          makePick('c2', { estimatedPrice: 0.995 }),
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchPickConfigurations).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.combos).toEqual([]);
    });
  });

  it('keeps combos whose estimatedPrice values are within the 1%-99% band', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({
        id: 'mid-band',
        picks: [
          makePick('c1', { estimatedPrice: 0.0185 }),
          makePick('c2', { estimatedPrice: 0.9895 }),
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].pickConfigId).toBe('mid-band');
  });

  it('allows combos where estimatedPrice is null', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({
        id: 'null-price',
        picks: [
          makePick('c1', { estimatedPrice: null }),
          makePick('c2', { estimatedPrice: 0.5 }),
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].pickConfigId).toBe('null-price');
  });

  it('caps results to count (default 3)', async () => {
    const useRecentCombos = await getHook();

    const configs = Array.from({ length: 10 }, (_, i) =>
      makeConfig({
        id: `pc${i}`,
        picks: [makePick(`a${i}`), makePick(`b${i}`)],
      })
    );
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(3);
    });
  });

  it('calculates probability correctly from collateral values', async () => {
    const useRecentCombos = await getHook();

    // counterparty=3000, predictor=1000 → probability = 3000/4000 = 0.75
    const configs = [
      makeConfig({
        id: 'prob-test',
        totalPredictorCollateral: '1000',
        totalCounterpartyCollateral: '3000',
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].probability).toBeCloseTo(0.75);
  });
});
