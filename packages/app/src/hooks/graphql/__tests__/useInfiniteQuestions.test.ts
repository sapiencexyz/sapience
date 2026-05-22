import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { QuestionType } from '../useInfiniteQuestions';

const mockFetchQuestionsPage = vi.fn();

vi.mock('@sapience/sdk/queries', () => ({
  fetchQuestionsPage: (...args: unknown[]) => mockFetchQuestionsPage(...args),
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
  const mod = await import('../useInfiniteQuestions');
  return mod.useInfiniteQuestions;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const question = (id: string): QuestionType => ({
  questionType: 'condition',
  condition: { id },
  group: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchQuestionsPage.mockResolvedValue({
    items: [],
    hasMore: false,
    endCursor: null,
  });
});

describe('useInfiniteQuestions', () => {
  it('coalesces repeated fetchMore calls while the next page is in flight', async () => {
    const useInfiniteQuestions = await getHook();
    const secondPage = deferred<{
      items: QuestionType[];
      hasMore: boolean;
      endCursor: string | null;
    }>();

    mockFetchQuestionsPage
      .mockResolvedValueOnce({
        items: [question('1')],
        hasMore: true,
        endCursor: 'cursor-1',
      })
      .mockReturnValueOnce(secondPage.promise);

    const { result } = renderHook(() => useInfiniteQuestions({ pageSize: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
      expect(result.current.hasMore).toBe(true);
    });

    act(() => {
      result.current.fetchMore();
      result.current.fetchMore();
      result.current.fetchMore();
    });

    expect(mockFetchQuestionsPage).toHaveBeenCalledTimes(2);
    expect(mockFetchQuestionsPage.mock.calls[1][0]).toMatchObject({
      take: 1,
      after: 'cursor-1',
    });

    await act(async () => {
      secondPage.resolve({
        items: [question('2')],
        hasMore: false,
        endCursor: null,
      });
      await secondPage.promise;
    });

    await waitFor(() => {
      expect(result.current.data.map((item) => item.condition?.id)).toEqual([
        '1',
        '2',
      ]);
    });
  });
});
