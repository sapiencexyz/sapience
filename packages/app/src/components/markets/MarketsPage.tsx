'use client';

import {
  CreatePythPredictionForm,
  type CreatePythPredictionFormValues,
  type PythPrediction,
} from '@sapience/ui';
import { PYTH_FEEDS } from '@sapience/sdk/constants';
import { useIsBelow } from '@sapience/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { ChevronLeft, Search } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import CreatePositionForm from '~/components/markets/CreatePositionForm';
import ExampleCombos from '~/components/markets/ExampleCombos';
import QuestionsTable from '~/components/markets/QuestionsTable';
import QuestionsGrid from '~/components/markets/polymarket/QuestionsGrid';
import SortControls from '~/components/markets/polymarket/SortControls';
import TagBar from '~/components/markets/TagBar';
import type { FilterState } from '~/components/markets/TableFilters';
import { getCardGridViewportStyle } from '~/components/markets/market-helpers';
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
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

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

  // Get compact status (needed by callbacks below)
  const isCompact = useIsBelow(1024);

  const { openPopover } = useCreatePositionContext();

  // View mode: default is table, ?view=polymarket switches to card grid
  const searchParams = useSearchParams();
  const useCardGrid = searchParams.get('view') === 'polymarket';

  // Filter state managed here, passed down to QuestionsTable / QuestionsGrid
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useSessionState(
    'sapience.markets.searchTerm',
    ''
  );
  // Key bumped to v3 after per-word Title Case normalization (e.g. cached
  // "Primary elections" no longer matches the new "Primary Elections";
  // force a reset of stale selections).
  const [selectedTag, setSelectedTag] = useSessionState<string | null>(
    'sapience.markets.selectedTag.v3',
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
        .map((c) => c.slug)
        .filter((slug): slug is string =>
          Boolean(slug && !slug.startsWith('prices-'))
        );
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
      router.replace('/markets', { scroll: false });
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

  const [pythPredictions, setPythPredictions] = useState<PythPrediction[]>([]);

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

  const handlePythPick = useCallback(
    (values: CreatePythPredictionFormValues) => {
      const id =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setPythPredictions((prev) => [
        ...prev,
        {
          id,
          priceId: values.priceId,
          priceFeedLabel: values.priceFeedLabel,
          direction: values.direction,
          targetPrice: values.targetPrice,
          targetPriceRaw: values.targetPriceRaw,
          targetPriceFullPrecision: values.targetPriceFullPrecision,
          priceExpo: values.priceExpo,
          dateTimeLocal: values.dateTimeLocal,
        },
      ]);

      // Mobile UX: open the create position form drawer so users can see their selection
      if (isCompact) {
        openPopover();
      }
    },
    [isCompact, openPopover]
  );

  const handleRemovePythPrediction = useCallback((id: string) => {
    setPythPredictions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Sort categories alphabetically for the filter dropdown
  const categoryOptions = useMemo(
    () =>
      allCategories
        .filter((category): category is typeof category & { slug: string } =>
          Boolean(category.slug)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
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
      className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start lg:gap-4"
    >
      {/* Render only one position form instance based on viewport */}
      {isCompact && (
        <div className="block lg:hidden">
          <CreatePositionForm
            pythPredictions={pythPredictions}
            onRemovePythPrediction={handleRemovePythPrediction}
            onClearPythPredictions={() => setPythPredictions([])}
          />
        </div>
      )}

      {/* Main Content */}
      <div
        className={
          useCardGrid ? 'flex-1 min-w-0 max-w-full flex flex-col' : 'contents'
        }
        style={getCardGridViewportStyle(useCardGrid)}
      >
        {useCardGrid && (
          <div className="px-3 lg:px-4 pt-1 pb-2">
            <button
              type="button"
              onClick={() => router.push('/markets')}
              className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-white/40 flex items-center gap-0.5 hover:text-white/70 transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
              All Markets
            </button>
          </div>
        )}
        <div
          className={
            useCardGrid
              ? 'markets-grid-theme flex-1 min-w-0 min-h-0 max-w-full overflow-hidden flex flex-col rounded-2xl shadow-[inset_0_6px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-white/15 mx-3 lg:mx-4 mb-3 lg:mb-4'
              : 'flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-4 pr-0 lg:pr-4 pb-4 lg:pb-6'
          }
          style={
            useCardGrid
              ? {
                  background:
                    'linear-gradient(165deg, #1354F0 0%, #082B89 100%)',
                }
              : { minHeight: 'calc(100dvh - var(--page-top-offset, 0px))' }
          }
        >
          {/* Polymarket header (grid view only) */}
          {useCardGrid && (
            <div className="px-3 pt-4 pb-3 md:px-6 md:pt-6 md:pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Image
                  src="/polymarket-logomark.png"
                  alt="Polymarket"
                  width={36}
                  height={36}
                  className="rounded-full"
                />
                <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-[0.015em] text-white">
                  Polymarket Parlays
                </h1>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 w-full sm:w-40 rounded-full bg-white/15 border border-white/20 pl-9 pr-3 text-sm text-white placeholder:text-white/40 font-display focus:outline-none focus:border-white/40"
                  />
                </div>
                <SortControls
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortChange={handleSortChange}
                />
              </div>
            </div>
          )}

          {/* Featured combos (table view only) */}
          {!useCardGrid && <ExampleCombos className="mt-4 xl:mt-0" />}

          {/* Predict Prices (table view only) */}
          {!useCardGrid && (
            <div className="w-full mt-4 mb-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="sc-heading text-foreground">Predict Prices</h2>
              </div>
              <CreatePythPredictionForm
                featuredFeeds={PYTH_FEEDS}
                onPick={handlePythPick}
              />
            </div>
          )}

          {/* Results area */}
          <div className="relative w-full max-w-full overflow-x-hidden flex-1 flex flex-col min-h-0">
            <motion.div
              className="h-full"
              key={useCardGrid ? 'grid-view' : 'table-view'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {useCardGrid ? (
                <QuestionsGrid
                  questions={questions}
                  isLoading={isLoadingData}
                  isFetchingMore={isFetchingMore}
                  hasMore={hasMore}
                  onFetchMore={fetchMore}
                />
              ) : (
                <div className="flex flex-col gap-2 sm:gap-4 h-full pt-2">
                  <div>
                    <h2 className="sc-heading text-foreground mb-3 px-1">
                      Prediction Markets
                    </h2>
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
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Desktop/Tablet sticky position form sidebar */}
      {!isCompact && (
        <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-1 xl:ml-2 lg:mr-6">
          <div
            className="rounded-none shadow-lg overflow-hidden"
            style={{
              height: 'calc(100dvh - 6rem)',
            }}
          >
            <div className="h-full overflow-y-auto">
              <CreatePositionForm
                variant="panel"
                pythPredictions={pythPredictions}
                onRemovePythPrediction={handleRemovePythPrediction}
                onClearPythPredictions={() => setPythPredictions([])}
              />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default MarketsPage;
