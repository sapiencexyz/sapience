import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchQuestionsSorted,
  type QuestionType,
  type SortField,
  type SortDirection,
} from '@sapience/sdk/queries';
export type { SortField, SortDirection, QuestionType };

export interface UseInfiniteQuestionsOptions {
  chainId?: number;
  search?: string;
  categorySlugs?: string[];
  pageSize?: number;
  sortField?: SortField;
  sortDirection?: SortDirection;
  minEndTime?: number;
  resolutionStatus?: string;
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
  } = opts;

  const minEndTime =
    rawMinEndTime != null && Number.isFinite(rawMinEndTime)
      ? rawMinEndTime
      : undefined;

  const [skip, setSkip] = useState(0);
  const [allLoadedData, setAllLoadedData] = useState<QuestionType[]>([]);
  const [hasMore, setHasMore] = useState(true);

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
  });
  const prevFiltersKeyRef = useRef(filtersKey);
  const lastSuccessfulSkipRef = useRef<number>(0);

  useEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      setSkip(0);
      setAllLoadedData([]);
      setHasMore(true);
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
    isFetchingMore: isFetching && skip > 0,
    hasMore,
    fetchMore,
  };
}
