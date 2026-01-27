import {
  useInfiniteQuestions,
  type QuestionType,
} from './useInfiniteQuestions';

export type SortField = 'openInterest' | 'endTime';
export type SortDirection = 'asc' | 'desc';

export type { QuestionType };

export interface UseInfiniteMarketsOptions {
  chainId?: number;
  search?: string;
  categorySlugs?: string[];
  pageSize?: number;
  sortField?: SortField;
  sortDirection?: SortDirection;
  /** Exclude settled/resolved markets from results */
  excludeSettled?: boolean;
  /** Only include markets with endTime >= this value (unix timestamp) */
  minEndTime?: number;
}

export interface UseInfiniteMarketsResult {
  items: QuestionType[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  fetchMore: () => void;
}

export function useInfiniteMarkets(
  opts: UseInfiniteMarketsOptions
): UseInfiniteMarketsResult {
  const result = useInfiniteQuestions(opts);

  return {
    items: result.data,
    isLoading: result.isLoading,
    isFetchingMore: result.isFetchingMore,
    hasMore: result.hasMore,
    fetchMore: result.fetchMore,
  };
}
