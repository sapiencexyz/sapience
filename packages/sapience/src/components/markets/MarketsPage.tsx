'use client';

import { useIsMobile, useIsBelow } from '@sapience/sdk/ui/hooks/use-mobile';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { FrownIcon } from 'lucide-react';
import dynamic from 'next/dynamic'; // Import dynamic
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { Tabs, TabsTrigger } from '@sapience/sdk/ui/components/ui/tabs';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

import { type Market as GraphQLMarketType } from '@sapience/sdk/types/graphql';
import { SearchBar } from '@sapience/sdk/ui';
import ParlayConditionCard from './ParlayConditionCard';
import MarketCard from './MarketCard';
import MarketGroupsRow from './MarketGroupsRow';
import ConditionRow from './ConditionRow';
import FocusAreaFilter from './FocusAreaFilter';
import {
  useEnrichedMarketGroups,
  useCategories,
} from '~/hooks/graphql/useMarketGroups';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { FOCUS_AREAS, type FocusArea } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import type { MarketGroupClassification } from '~/lib/types'; // Added import
import { getYAxisConfig, getMarketHeaderQuestion } from '~/lib/utils/util';
import Betslip from '~/components/markets/Betslip';
import SuggestedBetslips from '~/components/markets/SuggestedBetslips';

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

const DEFAULT_CATEGORY_COLOR = 'hsl(var(--muted-foreground))';

// Define local interfaces based on expected data shape
export interface MarketWithContext extends GraphQLMarketType {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  categorySlug: string;
  categoryId: string;
}

// Interface for the final grouped market data structure
interface GroupedMarketGroup {
  key: string;
  marketAddress: string;
  chainId: number;
  marketName: string;
  collateralAsset: string;
  color: string;
  categorySlug: string;
  categoryId: string;
  marketQuestion?: string | null;
  markets: MarketWithContext[];
  displayQuestion?: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

// Helper function to determine the day for a given timestamp
const getDayKey = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

// Helper to format end date display using date-fns
const formatEndDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return `Settling ${format(date, 'MMMM do')}`;
};

const MarketsPage = () => {
  // Use the new hook and update variable names
  const { data: enrichedMarketGroups, isLoading: isLoadingMarketGroups } =
    useEnrichedMarketGroups();
  const { data: categories, isLoading: isLoadingCategories } = useCategories();

  const searchParams = useSearchParams();
  const router = useRouter();

  // Get the category SLUG from the URL query parameter, default to null (all)
  const categorySlugParam = searchParams.get('category');
  const [selectedCategorySlug, setSelectedCategorySlug] = React.useState<
    string | null
  >(categorySlugParam);

  // Add state for the active/settled toggle
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active'>(
    'active'
  );

  // Parlay Mode toggle
  const [parlayMode, setParlayMode] = React.useState<boolean>(true);

  // View mode per browsing mode: list vs grid
  const [viewModeByMode, setViewModeByMode] = React.useState<{
    spot: 'list' | 'grid';
    parlay: 'list' | 'grid';
  }>({ spot: 'list', parlay: 'list' });
  const currentViewMode = parlayMode
    ? viewModeByMode.parlay
    : viewModeByMode.spot;
  const toggleViewMode = React.useCallback(() => {
    setViewModeByMode((prev) =>
      parlayMode
        ? { ...prev, parlay: prev.parlay === 'list' ? 'grid' : 'list' }
        : { ...prev, spot: prev.spot === 'list' ? 'grid' : 'list' }
    );
  }, [parlayMode]);

  // Initialize parlay mode from URL hash unconditionally
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    // New: '#spot' indicates singles mode; default (no hash) is parlays
    if (window.location.hash === '#spot') {
      setParlayMode(false);
    } else if (window.location.hash === '#parlays') {
      // Migrate legacy '#parlays' to default (no hash)
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
      setParlayMode(true);
    }
  }, []);

  // Handle parlay mode toggle and keep URL hash in sync
  const handleParlayModeChange = (enabled: boolean) => {
    setParlayMode(enabled);
    if (typeof window === 'undefined') return;
    if (!enabled) {
      const newHash = '#spot';
      if (window.location.hash !== newHash) {
        // Update hash without scrolling or adding a new history entry
        window.history.replaceState(null, '', newHash);
      }
    } else {
      // Clear hash entirely for default parlays view
      const url = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
    }
  };

  // RFQ Conditions via GraphQL
  const { data: allConditions = [], isLoading: isLoadingConditions } =
    useConditions({ take: 200 });

  // State for text filter
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Get mobile/compact status
  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);
  const effectiveViewMode: 'list' | 'grid' = isMobile
    ? 'grid'
    : currentViewMode;

  // Update the state when the URL parameter changes
  React.useEffect(() => {
    const currentCategorySlug = searchParams.get('category');
    // Basic validation: just set if it exists or is null
    setSelectedCategorySlug(currentCategorySlug);
  }, [searchParams]);

  // Conditions fetched via GraphQL; no REST fetch required

  // Handler for text filter changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const groupedMarketGroups: GroupedMarketGroup[] = React.useMemo(() => {
    if (!enrichedMarketGroups) return [];

    // 1. Filter enrichedMarketGroups by selected Category SLUG *before* flattening
    //    Also drop any market groups without an address or without any DEPLOYED markets (valid poolAddress)
    const filteredByCategory = enrichedMarketGroups.filter((marketGroup) => {
      const hasAddress =
        typeof marketGroup.address === 'string' &&
        marketGroup.address.length > 0;
      const hasDeployedMarkets = Array.isArray(marketGroup.markets)
        ? marketGroup.markets.some(
            (m) =>
              typeof m.poolAddress === 'string' &&
              m.poolAddress.length > 0 &&
              m.poolAddress !== '0x'
          )
        : false;

      if (!hasAddress || !hasDeployedMarkets) return false;

      if (selectedCategorySlug === null) return true; // Show all if no category selected

      const marketSlug = marketGroup.category?.slug;

      // Filter based on the actual category slug
      return marketSlug === selectedCategorySlug;
    });

    // 2. Map filteredMarketGroups to MarketWithContext[]
    const allMarkets: MarketWithContext[] = filteredByCategory.flatMap(
      (marketGroup) => {
        // Filter and map markets within this marketGroup
        return (
          marketGroup.markets
            // Only include deployed markets (with a valid poolAddress)
            .filter(
              (market) =>
                typeof market.poolAddress === 'string' &&
                market.poolAddress.length > 0 &&
                market.poolAddress !== '0x'
            )
            .filter(
              (
                market // market is GraphQLMarketType
              ) =>
                // Ensure startTimestamp and endTimestamp are numbers
                typeof market.startTimestamp === 'number' &&
                typeof market.endTimestamp === 'number'
              // You might also want to check if market.public is a boolean, etc., if those cause issues.
              // For now, focusing on timestamps as requested and common sources of null/undefined issues.
            )
            .map((market): MarketWithContext => {
              // At this point, market.startTimestamp and market.endTimestamp are numbers.
              // marketGroup.address, collateralAsset, category.slug, category.id are strings.
              return {
                ...market, // Spread properties from GraphQLMarketType (which includes start/end timestamps)

                // Explicitly assign core GraphQLMarketType properties that were filtered,
                // ensuring their type is number for consumers of MarketWithContext.
                // This helps TypeScript understand they are no longer Maybe<number>.
                startTimestamp: market.startTimestamp,
                endTimestamp: market.endTimestamp,

                // Add context fields from marketGroup
                marketAddress: marketGroup.address!,
                chainId: marketGroup.chainId,
                collateralAsset: marketGroup.collateralAsset!,
                categorySlug: marketGroup.category.slug,
                categoryId: marketGroup.category.id.toString(),
              };
            })
        );
      }
    );

    // 3. Filter markets based on status
    const now = Math.floor(Date.now() / 1000);
    const filteredMarketsByStatus: MarketWithContext[] = allMarkets.filter(
      (market) => {
        if (
          typeof market.endTimestamp !== 'number' ||
          market.endTimestamp <= 0
        ) {
          // console.warn('Filtering out market with invalid endTimestamp:', market); // Keep console log minimal
          return false;
        }
        if (!market.public) return false;
        if (statusFilter === 'active') {
          return now <= market.endTimestamp;
        }
        return true; // 'all' status includes everything public
      }
    );

    // 4. Group filtered markets by market group key
    const groupedByMarketKey = filteredMarketsByStatus.reduce<{
      [key: string]: GroupedMarketGroup;
    }>((acc, market) => {
      const marketKey = `${market.chainId}:${market.marketAddress}`;
      if (!acc[marketKey]) {
        const sourceMarketGroup = filteredByCategory.find(
          (m) => `${m.chainId}:${m.address}` === marketKey
        );

        const focusAreaStyle = FOCUS_AREAS.find(
          (fa) => fa.id === sourceMarketGroup?.category?.slug
        );
        const color = focusAreaStyle?.color ?? DEFAULT_CATEGORY_COLOR;

        // Ensure properties used for GroupedMarketGroup are valid strings
        const marketName = sourceMarketGroup?.category?.name;
        const { collateralAsset } = market; // This is string from MarketWithContext

        if (
          typeof marketName !== 'string' ||
          typeof collateralAsset !== 'string'
        ) {
          // Skip creating this group if essential display names are not strings
          // This is a safeguard, though collateralAsset should be string from MarketWithContext
          return acc;
        }

        acc[marketKey] = {
          key: marketKey,
          marketAddress: market.marketAddress,
          chainId: market.chainId,
          marketName,
          collateralAsset,
          color,
          categorySlug: market.categorySlug,
          categoryId: market.categoryId,
          marketQuestion: undefined,
          markets: [],
          displayQuestion: undefined,
          isActive: undefined,
          marketClassification: undefined,
          displayUnit: undefined,
        };
      }
      acc[marketKey].markets.push(market);
      return acc;
    }, {});

    // 5. Prepare market groups with questions
    const marketGroupsWithQuestions = Object.values(groupedByMarketKey).map(
      (groupedMarketGroup) => {
        // Find the source market group (needed for market-level question)
        const sourceMarketGroup = filteredByCategory.find(
          (m) => `${m.chainId}:${m.address}` === groupedMarketGroup.key
        );

        // Get the market-level question
        const marketQuestion = sourceMarketGroup?.question || null;

        // Find active markets for this market group using the existing 'now'
        const activeMarkets = groupedMarketGroup.markets.filter(
          (market) =>
            now >= market.startTimestamp! && now < market.endTimestamp!
        );
        const isActive = activeMarkets.length > 0;

        // Get the market classification directly
        const marketClassification = sourceMarketGroup?.marketClassification;

        // Get display unit from yAxisConfig
        let displayUnit = '';
        if (sourceMarketGroup) {
          const yAxisConfig = getYAxisConfig(sourceMarketGroup);
          displayUnit = yAxisConfig.unit;
        }

        // Use the same question logic as the header
        // Determine the "active market" for header logic:
        // If there's only one market total, use that market; otherwise use null
        const allMarketsInGroup = sourceMarketGroup?.markets || [];
        const singleMarket =
          allMarketsInGroup.length === 1 ? allMarketsInGroup[0] : null;

        const displayQuestion = getMarketHeaderQuestion(
          sourceMarketGroup,
          singleMarket
        );

        return {
          ...groupedMarketGroup,
          marketQuestion,
          displayQuestion,
          isActive,
          marketClassification,
          displayUnit,
        };
      }
    );

    // 6. Filter by Search Term *after* determining display question
    const lowerCaseSearchTerm = debouncedSearchTerm.toLowerCase();
    return marketGroupsWithQuestions.filter((marketGroup) => {
      if (!lowerCaseSearchTerm) return true; // Show all if search is empty

      const nameMatch = marketGroup.marketName
        ?.toLowerCase()
        .includes(lowerCaseSearchTerm);
      // Make sure displayQuestion exists before calling toLowerCase
      const questionMatch =
        marketGroup.displayQuestion &&
        marketGroup.displayQuestion.toLowerCase().includes(lowerCaseSearchTerm);

      return nameMatch || questionMatch;
    }); // Return the final filtered list
  }, [
    enrichedMarketGroups,
    selectedCategorySlug,
    statusFilter,
    debouncedSearchTerm,
  ]); // Changed searchTerm to debouncedSearchTerm
  // --- End of refactored useMemo ---

  // Group market groups by day based on their earliest active market
  const marketGroupsByDay = React.useMemo(() => {
    if (groupedMarketGroups.length === 0) return {};

    return groupedMarketGroups.reduce<Record<string, GroupedMarketGroup[]>>(
      (acc, marketGroup) => {
        // Find the earliest active market
        const nowForDayGrouping = Math.floor(Date.now() / 1000);
        const activeMarkets = marketGroup.markets.filter(
          (market) =>
            nowForDayGrouping >= market.startTimestamp! &&
            nowForDayGrouping < market.endTimestamp!
        );

        // Determine the timestamp to use for day grouping
        let timestamp;
        if (activeMarkets.length > 0) {
          timestamp = [...activeMarkets].sort(
            (a, b) => a.endTimestamp! - b.endTimestamp!
          )[0].endTimestamp!;
        } else {
          timestamp = [...marketGroup.markets].sort(
            (a, b) => a.endTimestamp! - b.endTimestamp!
          )[0].endTimestamp!;
        }

        const dayKey = getDayKey(timestamp);
        if (!acc[dayKey]) {
          acc[dayKey] = [];
        }
        acc[dayKey].push(marketGroup);
        return acc;
      },
      {}
    );
  }, [groupedMarketGroups]);

  // Calculate next ending market for each day
  const dayEndTimes = React.useMemo(() => {
    const result: Record<string, number> = {};

    Object.entries(marketGroupsByDay).forEach(([dayKey, marketGroups]) => {
      // Get all active markets from all market groups in this day
      const now = Math.floor(Date.now() / 1000);
      const allActiveMarkets = marketGroups.flatMap((marketGroup) =>
        marketGroup.markets.filter((market) => now < market.endTimestamp!)
      );

      if (allActiveMarkets.length > 0) {
        const nextEndingMarket = [...allActiveMarkets].sort(
          (a, b) => a.endTimestamp! - b.endTimestamp!
        )[0];

        result[dayKey] = nextEndingMarket.endTimestamp!;
      } else {
        const allMarketsInDay = marketGroups.flatMap(
          (marketGroup) => marketGroup.markets
        );
        // Ensure we handle the case where allMarketsInDay might be empty, though unlikely if marketGroupsByDay[dayKey] exists
        if (allMarketsInDay.length > 0) {
          const latestEndingMarket = [...allMarketsInDay].sort(
            (a, b) => b.endTimestamp! - a.endTimestamp!
          )[0];
          result[dayKey] = latestEndingMarket.endTimestamp!;
        } else {
          // Fallback if absolutely no markets, though getDayKey should prevent this dayKey from existing
          result[dayKey] = now;
        }
      }
    });

    return result;
  }, [marketGroupsByDay]);

  // Sort days chronologically
  const sortedDays = React.useMemo(() => {
    // Ensure dayEndTimes[a] and dayEndTimes[b] are numbers before sorting
    return Object.keys(marketGroupsByDay).sort((a, b) => {
      const timeA = dayEndTimes[a];
      const timeB = dayEndTimes[b];
      if (typeof timeA === 'number' && typeof timeB === 'number') {
        // When status filter is "all", sort by end time descending (latest first)
        // When status filter is "active", sort by end time ascending (earliest first)
        return statusFilter === 'all' ? timeB - timeA : timeA - timeB;
      }
      // Fallback sort if types are not numbers (should not happen with current logic)
      return 0;
    });
  }, [marketGroupsByDay, dayEndTimes, statusFilter]);

  // ===== Parlay Mode: group RFQ conditions by end date =====
  const filteredRfqConditions = React.useMemo(() => {
    const publicConditions: ConditionType[] = (allConditions || []).filter(
      (c) => c.public
    );
    if (publicConditions.length === 0) return [] as ConditionType[];
    const nowSec = Math.floor(Date.now() / 1000);
    const lower = debouncedSearchTerm.toLowerCase();
    return publicConditions.filter((c) => {
      // Respect Active/All: only exclude ended when Active
      if (
        statusFilter === 'active' &&
        typeof c.endTime === 'number' &&
        c.endTime > 0 &&
        c.endTime <= nowSec
      ) {
        return false;
      }
      // filter by category
      if (selectedCategorySlug && c.category?.slug !== selectedCategorySlug) {
        return false;
      }
      // filter by search
      if (!lower) return true;
      const haystacks: string[] = [];
      if (typeof c.question === 'string') haystacks.push(c.question);
      if (typeof c.claimStatement === 'string')
        haystacks.push(c.claimStatement);
      if (typeof c.description === 'string') haystacks.push(c.description);
      if (typeof c.category?.name === 'string') haystacks.push(c.category.name);
      if (typeof c.category?.slug === 'string') haystacks.push(c.category.slug);
      if (Array.isArray(c.similarMarkets)) haystacks.push(...c.similarMarkets);
      return haystacks.some((h) => h.toLowerCase().includes(lower));
    });
  }, [allConditions, selectedCategorySlug, debouncedSearchTerm, statusFilter]);

  const rfqConditionsByDay = React.useMemo(() => {
    if (!filteredRfqConditions || filteredRfqConditions.length === 0)
      return {} as Record<string, ConditionType[]>;
    const grouped = filteredRfqConditions.reduce<
      Record<string, ConditionType[]>
    >((acc, c) => {
      const end = typeof c.endTime === 'number' ? c.endTime : 0;
      const dayKey = end > 0 ? getDayKey(end) : 'No end time';
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(c);
      return acc;
    }, {});
    return grouped;
  }, [filteredRfqConditions]);

  const rfqDayEndTimes = React.useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(rfqConditionsByDay).forEach(([dayKey, list]) => {
      const withEnds = list.filter(
        (c) => typeof c.endTime === 'number' && c.endTime > 0
      ) as Array<ConditionType & { endTime: number }>;
      if (withEnds.length > 0) {
        if (statusFilter === 'all') {
          const latest = [...withEnds].sort((a, b) => b.endTime - a.endTime)[0]
            .endTime;
          result[dayKey] = latest;
        } else {
          const earliest = [...withEnds].sort(
            (a, b) => a.endTime - b.endTime
          )[0].endTime;
          result[dayKey] = earliest;
        }
      } else {
        result[dayKey] = Math.floor(Date.now() / 1000);
      }
    });
    return result;
  }, [rfqConditionsByDay, statusFilter]);

  const sortedRfqDays = React.useMemo(() => {
    return Object.keys(rfqConditionsByDay).sort((a, b) => {
      const timeA = rfqDayEndTimes[a] ?? 0;
      const timeB = rfqDayEndTimes[b] ?? 0;
      return statusFilter === 'all' ? timeB - timeA : timeA - timeB;
    });
  }, [rfqConditionsByDay, rfqDayEndTimes, statusFilter]);

  // Create a key that changes whenever filters change to force complete re-render
  const filterKey = React.useMemo(() => {
    return `${selectedCategorySlug || 'all'}-${statusFilter}-${debouncedSearchTerm}`;
  }, [selectedCategorySlug, statusFilter, debouncedSearchTerm]);

  // Update click handler for focus areas
  const handleCategoryClick = (categorySlug: string | null) => {
    setSelectedCategorySlug(categorySlug);
    const params = new URLSearchParams(searchParams);
    if (categorySlug === null) {
      params.delete('category');
    } else {
      params.set('category', categorySlug);
    }
    router.replace(`/markets?${params.toString()}`);
  };

  const handleStatusFilterClick = (filter: 'all' | 'active') => {
    setStatusFilter(filter);
  };

  // No sticky behavior for filters/search

  // Helper to find FocusArea data by category slug for UI styling
  const getCategoryStyle = (categorySlug: string): FocusArea | undefined => {
    // First try to find a matching focus area
    const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);

    if (focusArea) {
      return focusArea;
    }

    // If no matching focus area, compute determinstic color from CSS variable palette
    return {
      id: categorySlug,
      name: '', // Will use category.name from database
      resources: [],
      color: getDeterministicCategoryColor(categorySlug),
    };
  };

  // Show loader if either query is loading
  if (isLoadingMarketGroups || isLoadingCategories) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-theme(spacing.20))] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Render content once both are loaded
  return (
    <div className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start">
      {/* Render only one betslip instance based on viewport */}
      {isCompact ? (
        <div className="block lg:hidden">
          <Betslip
            isParlayMode={parlayMode}
            onParlayModeChange={handleParlayModeChange}
          />
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-6 pr-0 lg:pr-4 pb-16 lg:pb-0">
        {/* Top controls section (not sticky) */}
        <div>
          <div className="mt-4 md:mt-0 mb-3 md:mb-0">
            {isMobile ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <SearchBar
                    isMobile={isMobile}
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
                <Tabs
                  value={statusFilter}
                  onValueChange={(v) =>
                    handleStatusFilterClick((v as 'active' | 'all') || 'active')
                  }
                  className="ml-2"
                >
                  <SegmentedTabsList
                    containerRadiusClassName="rounded-md"
                    triggerRadiusClassName="rounded-sm"
                  >
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </SegmentedTabsList>
                </Tabs>
              </div>
            ) : (
              <SearchBar
                isMobile={isMobile}
                value={searchTerm}
                onChange={handleSearchChange}
              />
            )}
          </div>
          <motion.div
            className="mt-0 md:mt-3"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <FocusAreaFilter
              selectedCategorySlug={selectedCategorySlug}
              handleCategoryClick={handleCategoryClick}
              statusFilter={statusFilter}
              handleStatusFilterClick={handleStatusFilterClick}
              parlayMode={parlayMode}
              onParlayModeChange={handleParlayModeChange}
              isLoadingCategories={isLoadingCategories}
              categories={categories}
              getCategoryStyle={getCategoryStyle}
              containerClassName="px-0 md:px-0 py-0 w-full max-w-full box-border"
              viewMode={effectiveViewMode}
              onToggleViewMode={toggleViewMode}
              showViewToggle={!isMobile}
              showParlayToggle={false}
              hideStatusTabsOnMobile
            />
          </motion.div>
        </div>
        {parlayMode &&
        selectedCategorySlug === null &&
        searchTerm.trim() === '' ? (
          <SuggestedBetslips className="mb-1 md:mb-2" />
        ) : null}

        {/* Results area */}
        <div className="relative w-full max-w-full overflow-x-hidden min-h-[300px]">
          {!parlayMode ? (
            <AnimatePresence mode="wait" key={filterKey}>
              {groupedMarketGroups.length === 0 && (
                <motion.div
                  key="zero-state"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-full pt-48 text-center text-muted-foreground"
                >
                  <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
                  No questions match the selected filters.
                </motion.div>
              )}

              {groupedMarketGroups.length > 0 &&
                (effectiveViewMode === 'list' ? (
                  <motion.div
                    key="results-container-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {sortedDays.map((dayKey) => (
                      <motion.div
                        key={dayKey}
                        className="mb-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <div className="flex flex-col mb-2">
                          <h3 className="eyebrow text-foreground mb-2">
                            {formatEndDate(dayEndTimes[dayKey])}
                          </h3>
                          <div className="divide-y divide-brand-white/10">
                            {marketGroupsByDay[dayKey].map((marketGroup) => (
                              <motion.div
                                layout
                                key={marketGroup.key}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className=""
                              >
                                <MarketGroupsRow
                                  marketAddress={marketGroup.marketAddress}
                                  chainId={marketGroup.chainId}
                                  displayQuestion={
                                    marketGroup.displayQuestion || 'Loading...'
                                  }
                                  color={marketGroup.color}
                                  market={marketGroup.markets}
                                  isActive={marketGroup.isActive}
                                  marketClassification={
                                    marketGroup.marketClassification
                                  }
                                  displayUnit={marketGroup.displayUnit}
                                />
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="results-container-grid"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="eyebrow text-foreground">
                        {statusFilter === 'all'
                          ? 'All Prediction Markets'
                          : 'Ending Soon'}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4 xl:gap-4">
                      {groupedMarketGroups.map((group) => {
                        const preferred =
                          group.markets.find((m) => m.optionName === 'Yes') ||
                          group.markets[0];
                        const yesId = group.markets.find(
                          (m) => m.optionName === 'Yes'
                        )?.marketId;
                        const noId = group.markets.find(
                          (m) => m.optionName === 'No'
                        )?.marketId;
                        return (
                          <div key={group.key} className="md:min-h-[160px]">
                            <MarketCard
                              chainId={group.chainId}
                              marketAddress={group.marketAddress}
                              market={preferred}
                              yesMarketId={yesId}
                              noMarketId={noId}
                              color={group.color}
                              displayQuestion={
                                group.displayQuestion || group.marketName
                              }
                              isActive={group.isActive}
                              marketClassification={group.marketClassification}
                              displayUnit={group.displayUnit}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          ) : (
            <AnimatePresence mode="wait" key="parlay-mode">
              {isLoadingConditions ? (
                <motion.div
                  key="loading-rfq"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-full pt-48 text-center text-muted-foreground"
                >
                  Loading parlay conditions...
                </motion.div>
              ) : filteredRfqConditions.length === 0 ? (
                <motion.div
                  key="empty-rfq"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="w-full pt-48 text-center text-muted-foreground"
                >
                  No prediction markets found
                </motion.div>
              ) : effectiveViewMode === 'list' ? (
                <motion.div
                  key="rfq-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {sortedRfqDays.map((dayKey) => (
                    <motion.div
                      key={`rfq-day-${dayKey}`}
                      className="mb-8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="flex flex-col mb-2">
                        <h3 className="eyebrow text-foreground mb-2">
                          {dayKey === 'No end time'
                            ? 'No end time'
                            : formatEndDate(rfqDayEndTimes[dayKey])}
                        </h3>
                        <div className="divide-y divide-brand-white/10">
                          {[...(rfqConditionsByDay[dayKey] || [])]
                            .sort((a, b) => {
                              const aT = a.endTime ?? 0;
                              const bT = b.endTime ?? 0;
                              return statusFilter === 'all' ? bT - aT : aT - bT;
                            })
                            .map((c) => {
                              const categorySlug = c.category?.slug || '';
                              const styleInfo = categorySlug
                                ? getCategoryStyle(categorySlug)
                                : undefined;
                              const color =
                                styleInfo?.color || DEFAULT_CATEGORY_COLOR;
                              return (
                                <ConditionRow
                                  key={c.id}
                                  condition={c}
                                  color={color}
                                />
                              );
                            })}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="rfq-grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-center justify-between mt-0 mb-2">
                    <h3 className="eyebrow text-foreground">
                      {statusFilter === 'all'
                        ? 'All Prediction Markets'
                        : 'Ending Soon'}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4 xl:gap-4">
                    {filteredRfqConditions.map((c) => {
                      const categorySlug = c.category?.slug || '';
                      const styleInfo = categorySlug
                        ? getCategoryStyle(categorySlug)
                        : undefined;
                      const color = styleInfo?.color || DEFAULT_CATEGORY_COLOR;
                      return (
                        <ParlayConditionCard
                          key={c.id}
                          condition={c}
                          color={color}
                        />
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Desktop/Tablet sticky betslip sidebar */}
      {!isMobile ? (
        <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-3 xl:ml-4 lg:mr-6">
          <div className="rounded-none shadow-lg overflow-hidden h-[calc(100dvh-96px)]">
            <div className="h-full overflow-y-auto">
              <Betslip
                variant="panel"
                isParlayMode={parlayMode}
                onParlayModeChange={handleParlayModeChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarketsPage;
