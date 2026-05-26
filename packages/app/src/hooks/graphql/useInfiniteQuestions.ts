import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchQuestionsSorted,
  type QuestionType,
  type SortField,
  type SortDirection,
  type VolumeWindow,
} from '@sapience/sdk/queries';
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

  const [skip, setSkip] = useState(0);
  const [allLoadedData, setAllLoadedData] = useState<QuestionType[]>([]);
  const [hasMore, setHasMore] = useState(true);
  // Tracks the last skip value whose data has been merged into allLoadedData.
  // Used to keep isFetchingMore=true until the new rows are in the DOM,
  // preventing a layout shift where the skeleton disappears one frame before
  // the new rows appear.
  const [lastMergedSkip, setLastMergedSkip] = useState(-1);

  const processedSkipRef = useRef<number>(-1);
  const isFetchPendingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  const isFetchingRef = useRef(false);

  const filtersKey = JSON.stringify({
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
  const prevFiltersKeyRef = useRef(filtersKey);
  const lastSuccessfulSkipRef = useRef<number>(0);

  useEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      setSkip(0);
      setAllLoadedData([]);
      setHasMore(true);
      setLastMergedSkip(-1);
      processedSkipRef.current = -1;
      lastSuccessfulSkipRef.current = 0;
      isFetchPendingRef.current = false;
    }
  }, [filtersKey]);

  const {
    data: rawData,
    isFetching,
    isError,
  } = useQuery<QuestionType[], Error>({
    queryKey: [
      'infiniteQuestions',
      pageSize,
      skip,
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
    queryFn: () =>
      fetchQuestionsSorted({
        take: pageSize + 1,
        skip,
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

  useEffect(() => {
    if (rawData && processedSkipRef.current !== skip) {
      processedSkipRef.current = skip;
      lastSuccessfulSkipRef.current = skip;

      const hasMoreItems = rawData.length > pageSize;
      setHasMore(hasMoreItems);

      const items = hasMoreItems ? rawData.slice(0, pageSize) : rawData;

      if (skip === 0) {
        setAllLoadedData(items);
        setLastMergedSkip(skip);
      } else {
        setAllLoadedData((prev) => {
          const existingIds = new Set(
            prev.map((item) =>
              item.questionType === 'group'
                ? `group-${item.group?.id}`
                : `condition-${item.condition?.id}`
            )
          );

          const newItems = items.filter((item) => {
            const id =
              item.questionType === 'group'
                ? `group-${item.group?.id}`
                : `condition-${item.condition?.id}`;
            return !existingIds.has(id);
          });

          // Batched with setAllLoadedData — React renders both in the same frame,
          // so the skeleton stays visible until the new rows are ready.
          setLastMergedSkip(skip);

          return [...prev, ...newItems];
        });
      }
    }
  }, [rawData, skip, pageSize]);

  useEffect(() => {
    if (isError && skip !== lastSuccessfulSkipRef.current) {
      setSkip(lastSuccessfulSkipRef.current);
      isFetchPendingRef.current = false;
    }
  }, [isError, skip]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    isFetchingRef.current = isFetching;
    if (!isFetching) {
      isFetchPendingRef.current = false;
    }
  }, [isFetching]);

  const fetchMore = useCallback(() => {
    if (
      !isFetchPendingRef.current &&
      hasMoreRef.current &&
      !isFetchingRef.current
    ) {
      isFetchPendingRef.current = true;
      setSkip((prev) => prev + pageSize);
    }
  }, [pageSize]);

  return {
    data: allLoadedData,
    isLoading: isFetching && skip === 0,
    isFetchingMore: skip > 0 && (isFetching || lastMergedSkip !== skip),
    hasMore,
    fetchMore,
  };
}
