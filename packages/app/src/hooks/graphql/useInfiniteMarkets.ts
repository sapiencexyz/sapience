import {
  useInfiniteMarketItems,
  type MarketItemType,
} from './useInfiniteMarketItems';

export type SortField = 'openInterest' | 'endTime';
export type SortDirection = 'asc' | 'desc';

export type { MarketItemType };

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
  items: MarketItemType[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  fetchMore: () => void;
}

export function useInfiniteMarkets(
  opts: UseInfiniteMarketsOptions
): UseInfiniteMarketsResult {
  const result = useInfiniteMarketItems(opts);

  return {
    items: result.data,
    isLoading: result.isLoading,
    isFetchingMore: result.isFetchingMore,
    hasMore: result.hasMore,
    fetchMore: result.fetchMore,
  };
}
