import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  fetchQuestionsPage,
  type QuestionType,
  type SortField,
  type SortDirection,
  type VolumeWindow,
} from '@sapience/sdk/queries';
export type { SortField, SortDirection, VolumeWindow, QuestionType };

type QuestionsPage = {
  items: QuestionType[];
  hasMore: boolean;
  endCursor: string | null;
};

export interface UseInfiniteQuestionsOptions {
  chainId?: number;
  search?: string;
  categorySlugs?: string[];
  pageSize?: number;
  sortField?: SortField;
  sortDirection?: SortDirection;
  minEndTime?: number;
  resolutionStatus?: string;
  minEstimatedPrice?: number;
  maxEstimatedPrice?: number;
  minSimilarMarketVolume?: number;
  maxSimilarMarketVolume?: number;
  tag?: string;
  similarMarketVolumeWindow?: VolumeWindow;
}

export interface UseInfiniteQuestionsResult {
  data: QuestionType[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  fetchMore: () => void;
}

const itemKey = (item: QuestionType): string =>
  item.questionType === 'group'
    ? `group-${item.group?.id}`
    : `condition-${item.condition?.id}`;

export function useInfiniteQuestions(
  opts: UseInfiniteQuestionsOptions
): UseInfiniteQuestionsResult {
  const {
    chainId,
    search,
    categorySlugs,
    pageSize = 20,
    sortField = 'openInterest',
    sortDirection = 'desc',
    minEndTime: rawMinEndTime,
    resolutionStatus,
    minEstimatedPrice,
    maxEstimatedPrice,
    minSimilarMarketVolume,
    maxSimilarMarketVolume,
    tag,
    similarMarketVolumeWindow,
  } = opts;

  const minEndTime =
    rawMinEndTime != null && Number.isFinite(rawMinEndTime)
      ? rawMinEndTime
      : undefined;

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: [
        'infiniteQuestions',
        pageSize,
        chainId,
        search,
        categorySlugs,
        sortField,
        sortDirection,
        minEndTime,
        resolutionStatus,
        minEstimatedPrice,
        maxEstimatedPrice,
        minSimilarMarketVolume,
        maxSimilarMarketVolume,
        tag,
        similarMarketVolumeWindow,
      ],
      initialPageParam: null as string | null,
      // Cursor pagination is what the connection is designed for — every
      // page is one constant-cost server call. The old skip-based hook
      // re-fetched from offset zero with an ever-larger `first`, which
      // blew past the API's 15k query-complexity limit on page 2.
      getNextPageParam: (lastPage: QuestionsPage) =>
        lastPage.hasMore ? (lastPage.endCursor ?? undefined) : undefined,
      queryFn: ({ pageParam }): Promise<QuestionsPage> =>
        fetchQuestionsPage({
          take: pageSize,
          after: pageParam,
          chainId,
          sortField,
          sortDirection,
          search,
          categorySlugs,
          minEndTime,
          resolutionStatus,
          minEstimatedPrice,
          maxEstimatedPrice,
          minSimilarMarketVolume,
          maxSimilarMarketVolume,
          tag,
          similarMarketVolumeWindow,
        }),
    });

  // Deduplicate across page boundaries so a cursor that overlaps doesn't
  // double-render a row in the table.
  const items = useMemo<QuestionType[]>(() => {
    const seen = new Set<string>();
    const out: QuestionType[] = [];
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [data]);

  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    data: items,
    isLoading: isLoading && !data,
    isFetchingMore: isFetchingNextPage,
    hasMore: Boolean(hasNextPage),
    fetchMore,
  };
}
