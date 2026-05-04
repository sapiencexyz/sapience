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

async function getHook() {
  const mod = await import('../useAccountActivity');
  return mod.useAccountActivity;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ accountActivity: [] });
});

describe('useAccountActivity', () => {
  it('runs the query for the global feed (no account/pickConfigId/conditionId)', async () => {
    const useAccountActivity = await getHook();

    renderHook(() => useAccountActivity({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({
      address: null,
      pickConfigId: null,
      conditionId: null,
      take: 20,
      skip: 0,
    });
  });

  it('returns mapped prediction items from the global feed', async () => {
    const useAccountActivity = await getHook();

    mockGraphqlRequest.mockResolvedValue({
      accountActivity: [
        {
          type: 'prediction',
          timestamp: 1700000000,
          prediction: {
            id: 'p1',
            predictionId: '1',
            predictor: '0xaaa',
            counterparty: '0xbbb',
            predictorCollateral: '0',
            counterpartyCollateral: '0',
            settled: false,
            pickConfig: null,
          },
          trade: null,
        },
      ],
    });

    const { result } = renderHook(() => useAccountActivity({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items.length).toBe(1);
    });

    expect(result.current.items[0].type).toBe('prediction');
    expect(result.current.items[0].timestamp).toBe(1700000000 * 1000);
  });

  it('respects enabled=false override', async () => {
    const useAccountActivity = await getHook();

    renderHook(() => useAccountActivity({ enabled: false }), {
      wrapper: createWrapper(),
    });

    // Give react-query a tick to potentially schedule a fetch, then assert
    // it did not run.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  it('passes account + pickConfigId + conditionId through to the query', async () => {
    const useAccountActivity = await getHook();

    renderHook(
      () =>
        useAccountActivity({
          account: '0xABCDEF0000000000000000000000000000000001',
          pickConfigId: 'pc1',
          conditionId: 'c1',
          activityType: 'trade',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({
      address: '0xABCDEF0000000000000000000000000000000001',
      pickConfigId: 'pc1',
      conditionId: 'c1',
      type: 'trade',
    });
  });

  it('fetches only the next page when loading more activity', async () => {
    const useAccountActivity = await getHook();

    mockGraphqlRequest
      .mockResolvedValueOnce({
        accountActivity: [
          {
            type: 'prediction',
            timestamp: 1700000000,
            prediction: {
              id: 'p1',
              predictionId: '1',
              predictor: '0xaaa',
              counterparty: '0xbbb',
              predictorCollateral: '0',
              counterpartyCollateral: '0',
              settled: false,
              pickConfig: null,
            },
            trade: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        accountActivity: [
          {
            type: 'prediction',
            timestamp: 1700000001,
            prediction: {
              id: 'p2',
              predictionId: '2',
              predictor: '0xccc',
              counterparty: '0xddd',
              predictorCollateral: '0',
              counterpartyCollateral: '0',
              settled: false,
              pickConfig: null,
            },
            trade: null,
          },
        ],
      });

    const { result } = renderHook(() => useAccountActivity({ pageSize: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items.map((item) => item.timestamp)).toEqual([
        1700000000 * 1000,
      ]);
    });

    await act(async () => {
      result.current.fetchMore();
    });

    await waitFor(() => {
      expect(result.current.items.map((item) => item.timestamp)).toEqual([
        1700000000 * 1000,
        1700000001 * 1000,
      ]);
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      take: 1,
      skip: 0,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 1,
      skip: 1,
    });
  });
});
