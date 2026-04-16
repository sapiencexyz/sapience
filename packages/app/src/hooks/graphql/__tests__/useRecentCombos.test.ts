import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { PickConfigurationResult } from '@sapience/sdk/queries';
import type { ConditionById } from '@sapience/sdk/queries/conditions';

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

const mockUseConditionsByIds = vi.fn();

vi.mock('../useConditionsByIds', () => ({
  useConditionsByIds: (...args: unknown[]) => mockUseConditionsByIds(...args),
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

function makeConfig(
  overrides: Partial<PickConfigurationResult> & { id: string }
): PickConfigurationResult {
  return {
    chainId: 1,
    totalPredictorCollateral: '1000',
    totalCounterpartyCollateral: '1000',
    resolved: false,
    picks: [
      { conditionId: 'c1', conditionResolver: 'r1', predictedOutcome: 1 },
      { conditionId: 'c2', conditionResolver: 'r2', predictedOutcome: 0 },
    ],
    ...overrides,
  };
}

function makeCondition(
  overrides: Partial<ConditionById> & { id: string }
): ConditionById {
  return {
    shortName: null,
    question: 'Test?',
    description: null,
    endTime: Date.now() / 1000 + 86400,
    resolver: null,
    similarMarkets: [],
    category: null,
    settled: false,
    resolvedToYes: false,
    nonDecisive: false,
    estimatedPrice: 0.5,
    ...overrides,
  };
}

function conditionMap(conditions: ConditionById[]): Map<string, ConditionById> {
  return new Map(conditions.map((c) => [c.id, c]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchPickConfigurations.mockResolvedValue([]);
  mockUseConditionsByIds.mockReturnValue({
    map: new Map(),
    isLoading: false,
    error: null,
  });
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
    const conds = [makeCondition({ id: 'c1' }), makeCondition({ id: 'c2' })];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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
      makeConfig({
        id: 'single',
        picks: [
          { conditionId: 'c1', conditionResolver: 'r1', predictedOutcome: 1 },
        ],
      }),
      makeConfig({ id: 'multi' }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [makeCondition({ id: 'c1' }), makeCondition({ id: 'c2' })];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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
        picks: [
          { conditionId: 'c3', conditionResolver: 'r3', predictedOutcome: 1 },
          { conditionId: 'c4', conditionResolver: 'r4', predictedOutcome: 0 },
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1' }),
      makeCondition({ id: 'c2' }),
      makeCondition({ id: 'c3' }),
      makeCondition({ id: 'c4' }),
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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

  it('returns empty combos while conditions are loading (flash prevention)', async () => {
    const useRecentCombos = await getHook();

    const configs = [makeConfig({ id: 'pc1' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    // conditionMap is empty (size === 0) → should return []
    mockUseConditionsByIds.mockReturnValue({
      map: new Map(),
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchPickConfigurations).toHaveBeenCalled();
    });

    expect(result.current.combos).toEqual([]);
  });

  it('filters out combos where any condition is settled: true', async () => {
    const useRecentCombos = await getHook();

    const configs = [
      makeConfig({ id: 'settled-combo' }),
      makeConfig({
        id: 'active-combo',
        picks: [
          { conditionId: 'c3', conditionResolver: 'r3', predictedOutcome: 1 },
          { conditionId: 'c4', conditionResolver: 'r4', predictedOutcome: 0 },
        ],
      }),
    ];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1', settled: true }), // settled!
      makeCondition({ id: 'c2' }),
      makeCondition({ id: 'c3' }),
      makeCondition({ id: 'c4' }),
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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

    const configs = [makeConfig({ id: 'low-price' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1', estimatedPrice: 0.005 }), // < 0.01
      makeCondition({ id: 'c2', estimatedPrice: 0.5 }),
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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

    const configs = [makeConfig({ id: 'high-price' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1', estimatedPrice: 0.5 }),
      makeCondition({ id: 'c2', estimatedPrice: 0.995 }), // > 0.99
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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

    const configs = [makeConfig({ id: 'mid-band' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1', estimatedPrice: 0.0185 }),
      makeCondition({ id: 'c2', estimatedPrice: 0.9895 }),
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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

    const configs = [makeConfig({ id: 'null-price' })];
    mockFetchPickConfigurations.mockResolvedValue(configs);
    const conds = [
      makeCondition({ id: 'c1', estimatedPrice: null }),
      makeCondition({ id: 'c2', estimatedPrice: 0.5 }),
    ];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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
        picks: [
          {
            conditionId: `a${i}`,
            conditionResolver: 'r1',
            predictedOutcome: 1,
          },
          {
            conditionId: `b${i}`,
            conditionResolver: 'r2',
            predictedOutcome: 0,
          },
        ],
      })
    );
    mockFetchPickConfigurations.mockResolvedValue(configs);

    const conds: ConditionById[] = [];
    for (let i = 0; i < 10; i++) {
      conds.push(makeCondition({ id: `a${i}` }));
      conds.push(makeCondition({ id: `b${i}` }));
    }
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

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
    const conds = [makeCondition({ id: 'c1' }), makeCondition({ id: 'c2' })];
    mockUseConditionsByIds.mockReturnValue({
      map: conditionMap(conds),
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useRecentCombos({ chainId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.combos.length).toBe(1);
    });

    expect(result.current.combos[0].probability).toBeCloseTo(0.75);
  });
});
