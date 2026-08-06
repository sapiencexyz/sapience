import { useCallback, useMemo } from 'react';
import {
  GET_QUESTIONS,
  buildQuestionsVariables,
  toQuestionType,
  type QuestionItem,
  type QuestionType,
  type SortField,
  type SortDirection,
  type VolumeWindow,
} from '~/lib/sdk/queries';
import { useCursorPagination } from '~/hooks/useCursorPagination';

export type { SortField, SortDirection, VolumeWindow, QuestionType };

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

/**
 * Infinite questions feed over the cursor connection.
 *
 * The previous implementation emulated "has more" with a `take: pageSize + 1`
 * over-fetch and a skip-offset state machine; the `QuestionConnection` is
 * forward-cursor native (`pageInfo.hasNextPage` + `endCursor`), so paging is
 * delegated to the shared `useCursorPagination` adapter. Raw `QuestionItem`
 * union nodes are mapped back into the stable `QuestionType` envelope for
 * MarketsPage / QuestionsTable.
 */
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

  const { filter, orderBy } = buildQuestionsVariables({
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
  });

  const {
    data: nodes,
    isLoading,
    isFetchingMore,
    hasNextPage,
    loadMore,
  } = useCursorPagination<QuestionItem>({
    // Filters/sort ride in `variables`, which useCursorPagination folds
    // into the React Query key — any change resets to a fresh first page.
    queryKey: ['infiniteQuestions'],
    query: GET_QUESTIONS,
    connectionKey: 'questions',
    pageSize,
    variables: { filter: filter ?? null, orderBy },
  });

  // Map union nodes back into the stable envelopes and drop duplicates that can
  // appear when rows shift between cursor pages under volatile sorts.
  const data = useMemo(() => {
    const seen = new Set<string>();
    const items: QuestionType[] = [];
    for (const node of nodes) {
      const item = toQuestionType(node);
      const key =
        item.questionType === 'group'
          ? `group-${item.group?.id}`
          : `condition-${item.condition?.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    return items;
  }, [nodes]);

  const fetchMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  return {
    data,
    isLoading,
    isFetchingMore,
    hasMore: hasNextPage,
    fetchMore,
  };
}
