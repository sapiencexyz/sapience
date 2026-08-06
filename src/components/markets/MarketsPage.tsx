'use client';

import { motion } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMemo, useCallback, useEffect, useRef } from 'react';

import QuestionsTable from '~/components/markets/QuestionsTable';
import TagBar from '~/components/markets/TagBar';
import type { FilterState } from '~/components/markets/TableFilters';
import { useCategories } from '~/hooks/graphql/useCategories';
import { usePopularTags } from '~/hooks/graphql/usePopularTags';
import {
  useInfiniteQuestions,
  type SortField,
  type SortDirection,
  type VolumeWindow,
} from '~/hooks/graphql/useInfiniteQuestions';
import { useDebouncedValue } from '~/hooks/useDebouncedValue';
import { useSessionState } from '~/hooks/useSessionState';

const VALID_SORT_FIELDS: SortField[] = [
  'openInterest',
  'endTime',
  'createdAt',
  'predictionCount',
  'similarMarketVolume',
];

function migrateMarketSortField(value: unknown): SortField {
  return VALID_SORT_FIELDS.includes(value as SortField)
    ? (value as SortField)
    : 'openInterest';
}

const MarketsPage = () => {
  const { data: allCategories = [], isLoading: isLoadingCategories } =
    useCategories();
  const { data: popularTags = [] } = usePopularTags();

  const searchParams = useSearchParams();

  // Filter state managed here, passed down to QuestionsTable
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useSessionState(
    'sapience.markets.searchTerm',
    ''
  );
  // Key bumped to v2 after tag-case normalization (lowercase values like
  // "temperature" no longer match; force a reset of stale selections).
  const [selectedTag, setSelectedTag] = useSessionState<string | null>(
    'sapience.markets.selectedTag.v2',
    null
  );
  const defaultFilters: FilterState = {
    openInterestRange: [0, Infinity],
    similarMarketVolumeRange: [0, Infinity],
    similarMarketVolume1hRange: [0, Infinity],
    similarMarketVolume4hRange: [0, Infinity],
    similarMarketVolume24hRange: [0, Infinity],
    similarMarketVolume7dRange: [0, Infinity],
    timeToResolutionRange: [-Infinity, Infinity],
    selectedCategories: [],
    resolutionStatus: 'unresolved',
    estimatedPriceRange: [1, 99],
  };

  const [rawFilters, setFilters] = useSessionState<FilterState>(
    'sapience.markets.filters',
    defaultFilters
  );

  // Merge with defaults so stale sessionStorage entries gain new fields
  const filters: FilterState = { ...defaultFilters, ...rawFilters };

  // Default to prediction-market categories (exclude prices) on first load
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (
      !defaultedRef.current &&
      allCategories.length > 0 &&
      filters.selectedCategories.length === 0
    ) {
      defaultedRef.current = true;
      const pmSlugs = allCategories
        .filter((c) => !c.slug.startsWith('prices-'))
        .map((c) => c.slug);
      setFilters((prev) => ({ ...prev, selectedCategories: pmSlugs }));
    }
  }, [allCategories, filters.selectedCategories, setFilters]);

  // Pick up ?category= from URL on initial load and client-side navigation
  const appliedCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    const category = searchParams.get('category');
    if (category && category !== appliedCategoryRef.current) {
      appliedCategoryRef.current = category;
      setFilters((prev) => ({
        ...prev,
        selectedCategories: [category],
      }));
      router.replace('/', { scroll: false });
    }
  }, [searchParams, router, setFilters]);

  // Sorting state - lifted here so backend can respect it during pagination
  const [sortField, setSortField] = useSessionState<SortField>(
    'sapience.markets.sortField',
    'openInterest',
    {
      migrate: migrateMarketSortField,
    }
  );
  const [sortDirection, setSortDirection] = useSessionState<SortDirection>(
    'sapience.markets.sortDirection',
    'desc'
  );
  const [volumeWindow, setVolumeWindow] = useSessionState<VolumeWindow | null>(
    'sapience.markets.volumeWindow',
    null
  );
  const [filterVolume, setFilterVolume] = useSessionState<boolean>(
    'sapience.markets.filterVolume',
    false
  );

  const handleSortChange = useCallback(
    (field: SortField, direction: SortDirection) => {
      setSortField(field);
      setSortDirection(direction);
    },
    [setSortField, setSortDirection]
  );

  // Debounce search term for backend queries (300ms)
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // When a tag is selected, don't send a text search (they're mutually exclusive in the UI)
  const effectiveSearch = selectedTag
    ? undefined
    : debouncedSearchTerm.trim() || undefined;

  // Compute backend filter params from client filter state
  // timeToResolutionRange[0] = min days from now (0 = today, negative = past)
  const minEndTime = useMemo(() => {
    const [minDays] = filters.timeToResolutionRange;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec + minDays * 86400;
  }, [filters.timeToResolutionRange]);

  const selectedSimilarMarketVolumeRange = useMemo<[number, number]>(() => {
    if (volumeWindow === '1h')
      return filters.similarMarketVolume1hRange ?? [0, Infinity];
    if (volumeWindow === '4h')
      return filters.similarMarketVolume4hRange ?? [0, Infinity];
    if (volumeWindow === '24h')
      return filters.similarMarketVolume24hRange ?? [0, Infinity];
    if (volumeWindow === '7d')
      return filters.similarMarketVolume7dRange ?? [0, Infinity];
    return filters.similarMarketVolumeRange ?? [0, Infinity];
  }, [
    filters.similarMarketVolume1hRange,
    filters.similarMarketVolume4hRange,
    filters.similarMarketVolume24hRange,
    filters.similarMarketVolume7dRange,
    filters.similarMarketVolumeRange,
    volumeWindow,
  ]);

  // Fetch questions (both groups and ungrouped conditions interleaved)
  const {
    data: questions,
    isLoading: isLoadingData,
    isFetchingMore,
    hasMore,
    fetchMore,
  } = useInfiniteQuestions({
    search: effectiveSearch,
    tag: selectedTag ?? undefined,
    categorySlugs:
      filters.selectedCategories.length > 0
        ? filters.selectedCategories
        : undefined,
    pageSize: 20,
    sortField,
    sortDirection,
    // Backend filtering for markets after this time
    minEndTime,
    // Backend filtering by resolution status
    resolutionStatus: filters.resolutionStatus,
    // Backend filtering by estimated price (convert percentage to 0-1)
    ...((filters.estimatedPriceRange?.[0] ?? 0) > 0
      ? { minEstimatedPrice: filters.estimatedPriceRange[0] / 100 }
      : {}),
    ...((filters.estimatedPriceRange?.[1] ?? 100) < 100
      ? { maxEstimatedPrice: filters.estimatedPriceRange[1] / 100 }
      : {}),
    similarMarketVolumeWindow: volumeWindow
      ? filterVolume
        ? (`${volumeWindow}Filtered` as VolumeWindow)
        : volumeWindow
      : undefined,
    ...(selectedSimilarMarketVolumeRange[0] > 0
      ? { minSimilarMarketVolume: selectedSimilarMarketVolumeRange[0] }
      : {}),
    ...(Number.isFinite(selectedSimilarMarketVolumeRange[1])
      ? { maxSimilarMarketVolume: selectedSimilarMarketVolumeRange[1] }
      : {}),
  });

  // Sort categories alphabetically for the filter dropdown
  const categoryOptions = useMemo(
    () => [...allCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories]
  );

  // Show nothing while loading, then fade in content
  if (isLoadingCategories) {
    return (
      <div
        className="w-full"
        style={{ minHeight: 'calc(100dvh - var(--page-top-offset, 0px))' }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative w-full max-w-full overflow-visible flex flex-col items-start"
    >
      <div
        className="flex-1 w-full min-w-0 max-w-full overflow-visible flex flex-col gap-4 pb-4 lg:pb-6"
        style={{ minHeight: 'calc(100dvh - var(--page-top-offset, 0px))' }}
      >
        <div className="relative w-full max-w-full overflow-x-hidden flex-1 flex flex-col min-h-0">
          <motion.div
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex flex-col gap-2 sm:gap-4 h-full pt-2">
              <div>
                <TagBar
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  selectedTag={selectedTag}
                  onSelectedTagChange={setSelectedTag}
                  popularTags={popularTags}
                />
              </div>
              <QuestionsTable
                questions={questions}
                isLoading={isLoadingData}
                isFetchingMore={isFetchingMore}
                hasMore={hasMore}
                onFetchMore={fetchMore}
                filters={filters}
                onFiltersChange={setFilters}
                categories={categoryOptions}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                volumeWindow={volumeWindow}
                onVolumeWindowChange={setVolumeWindow}
                filterVolume={filterVolume}
                onFilterVolumeChange={setFilterVolume}
                searchTerm={searchTerm}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default MarketsPage;
