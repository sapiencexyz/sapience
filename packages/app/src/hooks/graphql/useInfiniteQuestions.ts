import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { ConditionType } from './useConditions';
import type { ConditionGroupType } from './useConditionGroups';

export type SortField = 'openInterest' | 'endTime';
export type SortDirection = 'asc' | 'desc';

export interface QuestionType {
  questionType: 'group' | 'condition';
  group?: ConditionGroupType | null;
  condition?: ConditionType | null;
}

const GET_QUESTIONS_SORTED = /* GraphQL */ `
  query QuestionsSorted(
    $take: Int!
    $skip: Int!
    $chainId: Int
    $sortField: String!
    $sortDirection: String!
    $search: String
    $categorySlugs: [String!]
    $excludeSettled: Boolean
    $minEndTime: Int
    $resolutionStatus: String
  ) {
    questionsSorted(
      take: $take
      skip: $skip
      chainId: $chainId
      sortField: $sortField
      sortDirection: $sortDirection
      search: $search
      categorySlugs: $categorySlugs
      excludeSettled: $excludeSettled
      minEndTime: $minEndTime
      resolutionStatus: $resolutionStatus
    ) {
      questionType
      group {
        id
        createdAt
        name
        category {
          id
          name
          slug
        }
        conditions {
          id
          createdAt
          question
          shortName
          endTime
          public
          claimStatement
          description
          similarMarkets
          chainId
          resolver
          settled
          resolvedToYes
          assertionId
          assertionTimestamp
          openInterest
          conditionGroupId
          category {
            id
            name
            slug
          }
          displayOrder
        }
      }
      condition {
        id
        createdAt
        question
        shortName
        endTime
        public
        claimStatement
        description
        similarMarkets
        chainId
        resolver
        settled
        resolvedToYes
        assertionId
        assertionTimestamp
        openInterest
        conditionGroupId
        category {
          id
          name
          slug
        }
      }
    }
  }
`;

export interface UseInfiniteQuestionsOptions {
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
  /** Filter by resolution status: 'all' | 'unresolved' | 'resolvedYes' | 'resolvedNo' */
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
    excludeSettled,
    minEndTime,
    resolutionStatus,
  } = opts;

  const [skip, setSkip] = useState(0);
  const [allLoadedData, setAllLoadedData] = useState<QuestionType[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // Track processed fetches to avoid duplicate accumulation
  const processedSkipRef = useRef<number>(-1);

  // Track if a fetch is pending (prevents multiple fetchMore calls)
  const isFetchPendingRef = useRef(false);

  // Refs for stable fetchMore callback - avoids stale closures
  const hasMoreRef = useRef(hasMore);
  const isFetchingRef = useRef(false);

  // Stable reference for filter comparison (includes sort to reset pagination when sort changes)
  const filtersKey = JSON.stringify({
    chainId,
    search,
    categorySlugs,
    sortField,
    sortDirection,
    excludeSettled,
    minEndTime,
    resolutionStatus,
  });
  const prevFiltersKeyRef = useRef(filtersKey);

  // Reset when filters change
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

  // Track the last successfully processed skip value for error recovery
  const lastSuccessfulSkipRef = useRef<number>(0);

  // Fetch current page (+ 1 extra to detect if more exist)
  // Use isFetching (not isLoading) - isLoading is only true on first load,
  // isFetching is true whenever data is being fetched
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
      excludeSettled,
      minEndTime,
      resolutionStatus,
    ],
    queryFn: async (): Promise<QuestionType[]> => {
      type QuestionsQueryResult = {
        questionsSorted: QuestionType[];
      };
      const variables = {
        take: pageSize + 1,
        skip,
        chainId: chainId ?? null,
        sortField,
        sortDirection,
        search: search?.trim() || null,
        categorySlugs: categorySlugs?.length ? categorySlugs : null,
        excludeSettled: excludeSettled ?? null,
        minEndTime: minEndTime ?? null,
        resolutionStatus: resolutionStatus ?? null,
      };

      const data = await graphqlRequest<QuestionsQueryResult>(
        GET_QUESTIONS_SORTED,
        variables
      );

      return data.questionsSorted ?? [];
    },
  });

  // Accumulate data when new page arrives
  useEffect(() => {
    if (rawData && processedSkipRef.current !== skip) {
      processedSkipRef.current = skip;
      lastSuccessfulSkipRef.current = skip; // Track successful fetch

      const hasMoreItems = rawData.length > pageSize;
      setHasMore(hasMoreItems);

      const items = hasMoreItems ? rawData.slice(0, pageSize) : rawData;

      if (skip === 0) {
        setAllLoadedData(items);
      } else {
        setAllLoadedData((prev) => {
          // Create a set of existing IDs to deduplicate
          // This prevents duplicate keys if items shift between page fetches
          const existingIds = new Set(
            prev.map((item) =>
              item.questionType === 'group'
                ? `group-${item.group?.id}`
                : `condition-${item.condition?.id}`
            )
          );

          // Filter out any items that already exist in previous pages
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

  // Reset skip on error to allow retry from last successful position
  useEffect(() => {
    if (isError && skip !== lastSuccessfulSkipRef.current) {
      // Reset to last successful skip so user can retry
      setSkip(lastSuccessfulSkipRef.current);
      isFetchPendingRef.current = false;
    }
  }, [isError, skip]);

  // Keep refs in sync with state for stable fetchMore callback
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    isFetchingRef.current = isFetching;
    // Reset pending flag when loading completes (success OR failure)
    // This prevents the lock from persisting if the query fails or returns cached data
    if (!isFetching) {
      isFetchPendingRef.current = false;
    }
  }, [isFetching]);

  // Stable fetchMore callback - uses refs to avoid stale closures
  const fetchMore = useCallback(() => {
    // Block if: already fetching, no more data, or initial load in progress
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
