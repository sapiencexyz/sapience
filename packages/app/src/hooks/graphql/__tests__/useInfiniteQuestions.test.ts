import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGraphqlRequest = vi.fn();
const mockGraphqlRequestV2 = vi.fn();

// Transport boundary (used by useCursorPagination) is mocked; the
// questions document/builder/mapper come from the real SDK SOURCE so a
// stale dist build can't bite.
vi.mock('@sapience/sdk/queries/client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));
vi.mock('@sapience/sdk/queries', async () => {
  return await import('../../../../../sdk/queries/questions');
});

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

async function getModule() {
  return import('../useInfiniteQuestions');
}

function conditionNode(conditionId: string) {
  return {
    __typename: 'Condition',
    conditionId,
    createdAt: '2026-01-01T00:00:00.000Z',
    question: `Q ${conditionId}`,
    shortName: null,
    optionName: null,
    endTime: 1760000000,
    isPublic: true,
    description: '',
    chainId: 8453,
    resolver: '0xresolver',
    settled: false,
    resolvedToYes: false,
    nonDecisive: false,
    openInterest: '100',
    estimatedPrice: null,
    similarMarket: null,
    category: null,
  };
}

function groupNode(id: string) {
  return {
    __typename: 'ConditionGroup',
    id,
    createdAt: '2026-01-02T00:00:00.000Z',
    name: `Group ${id}`,
    category: { name: 'Sports', slug: 'sports' },
    conditions: { nodes: [conditionNode('0xgc1')] },
  };
}

function page(
  nodes: unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
) {
  return {
    questions: {
      edges: nodes.map((node, i) => ({ cursor: `cur-${i}`, node })),
      pageInfo,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockRejectedValue(
    new Error('v1 transport must not be used')
  );
  mockGraphqlRequestV2.mockResolvedValue(
    page([], { hasNextPage: false, endCursor: null })
  );
});

describe('useInfiniteQuestions', () => {
  it('fetches the first page with cursor variables and explicit orderBy', async () => {
    mockGraphqlRequestV2.mockResolvedValue(
      page([conditionNode('0xa'), groupNode('g1')], {
        hasNextPage: true,
        endCursor: 'cursor-1',
      })
    );
    const { useInfiniteQuestions } = await getModule();

    const { result } = renderHook(() => useInfiniteQuestions({ pageSize: 2 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGraphqlRequestV2).toHaveBeenCalledTimes(1);
    const [doc, vars] = mockGraphqlRequestV2.mock.calls[0];
    expect(doc).toContain('... on Condition');
    expect(vars.first).toBe(2);
    expect(vars.after).toBeNull();
    // defaults: openInterest desc, explicit
    expect(vars.orderBy).toEqual({ field: 'OPEN_INTEREST', direction: 'DESC' });

    // mapped back into the v1 QuestionType envelope
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].questionType).toBe('condition');
    expect(result.current.data[0].condition?.id).toBe('0xa');
    expect(result.current.data[1].questionType).toBe('group');
    expect(result.current.data[1].group?.id).toBe('g1');
    expect(result.current.data[1].group?.conditions[0].conditionGroupId).toBe(
      'g1'
    );
    expect(result.current.hasMore).toBe(true);
  });

  it('threads endCursor into the next page and dedupes repeated items', async () => {
    mockGraphqlRequestV2
      .mockResolvedValueOnce(
        page([conditionNode('0xa')], { hasNextPage: true, endCursor: 'c-a' })
      )
      .mockResolvedValueOnce(
        page([conditionNode('0xb'), conditionNode('0xa')], {
          hasNextPage: false,
          endCursor: 'c-b',
        })
      );
    const { useInfiniteQuestions } = await getModule();

    const { result } = renderHook(() => useInfiniteQuestions({ pageSize: 1 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.fetchMore());

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    const [, vars2] = mockGraphqlRequestV2.mock.calls[1];
    expect(vars2.after).toBe('c-a');
    // 0xa repeated on page 2 is dropped
    expect(result.current.data.map((q) => q.condition?.id)).toEqual([
      '0xa',
      '0xb',
    ]);
  });

  it('maps feed options into the v2 filter and drops non-finite minEndTime', async () => {
    const { useInfiniteQuestions } = await getModule();

    const { result } = renderHook(
      () =>
        useInfiniteQuestions({
          search: ' eth ',
          tag: 'btc',
          minEndTime: Number.NaN,
          sortField: 'similarMarketVolume',
          sortDirection: 'asc',
          similarMarketVolumeWindow: '24h',
        }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const [, vars] = mockGraphqlRequestV2.mock.calls[0];
    expect(vars.filter).toEqual({
      search: 'eth',
      tag: 'btc',
      similarMarketVolumeWindow: 'TWENTY_FOUR_HOURS',
    });
    expect(vars.orderBy).toEqual({
      field: 'SIMILAR_MARKET_VOLUME_24H',
      direction: 'ASC',
    });
  });

  it('never touches the v1 transport', async () => {
    const { useInfiniteQuestions } = await getModule();
    const { result } = renderHook(() => useInfiniteQuestions({}), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });
});
