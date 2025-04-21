'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@foil/ui/components/ui/sheet';
import { Skeleton } from '@foil/ui/components/ui/skeleton';
import { useIsMobile } from '@foil/ui/hooks/use-mobile';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FrownIcon,
  LayoutGridIcon,
  TagIcon,
  SlidersHorizontal,
  SearchIcon,
} from 'lucide-react';
import dynamic from 'next/dynamic'; // Import dynamic
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  useEnrichedMarketGroups,
  useCategories,
  type Market,
} from '~/hooks/graphql/useMarketGroups';
import { FOCUS_AREAS, type FocusArea } from '~/lib/constants/focusAreas';
import { formatQuestion } from '~/lib/utils/util';

import MarketGroupsRow from './MarketGroupsRow';

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

// Constants for button classes
const selectedStatusClass = 'bg-secondary';
const hoverStatusClass = 'hover:bg-secondary/50';
const DEFAULT_CATEGORY_COLOR = '#71717a';

// Define local interfaces based on expected data shape
interface MarketWithContext extends Market {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  isYin: boolean;
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
  isYin: boolean;
  marketQuestion?: string | null;
  markets: MarketWithContext[];
  displayQuestion?: string;
}

// Define FocusAreaFilter component outside ForecastingTable
const FocusAreaFilter = ({
  selectedCategorySlug,
  handleCategoryClick,
  statusFilter,
  handleStatusFilterClick,
  isLoadingCategories,
  categories,
  getCategoryStyle,
}: {
  selectedCategorySlug: string | null;
  handleCategoryClick: (categorySlug: string | null) => void;
  statusFilter: 'all' | 'active';
  handleStatusFilterClick: (filter: 'all' | 'active') => void;
  isLoadingCategories: boolean;
  categories: any[] | null | undefined;
  getCategoryStyle: (categorySlug: string) => FocusArea | undefined;
}) => (
  <div className="p-5 w-[280px] mt-0">
    <div className="pb-2">
      <h3 className="font-medium mb-4 md:hidden">Filters</h3>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => handleCategoryClick(null)}
          className={`inline-flex text-left px-2 pr-4 py-1.5 rounded-full items-center gap-2 transition-colors text-xs ${selectedCategorySlug === null ? selectedStatusClass : hoverStatusClass}`}
        >
          <div className="rounded-full p-1 w-7 h-7 flex items-center justify-center bg-zinc-500/20">
            <LayoutGridIcon className="w-3 h-3 text-zinc-500" />
          </div>
          <span className="font-medium">All Focus Areas</span>
        </button>
        {isLoadingCategories &&
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-full" />
          ))}
        {!isLoadingCategories &&
          categories &&
          categories
            // Display only categories that are also in FOCUS_AREAS
            .filter((category) =>
              FOCUS_AREAS.some((fa) => fa.id === category.slug)
            )
            .map((category) => {
              const styleInfo = getCategoryStyle(category.slug);
              const categoryColor = styleInfo?.color ?? DEFAULT_CATEGORY_COLOR;

              // Use the name from FOCUS_AREAS if available, otherwise fall back to category.name
              const displayName = styleInfo?.name || category.name;

              return (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => handleCategoryClick(category.slug)}
                  className={`inline-flex text-left px-2 pr-4 py-1.5 rounded-full items-center gap-2 transition-colors text-xs ${selectedCategorySlug === category.slug ? selectedStatusClass : hoverStatusClass}`}
                >
                  <div
                    className="rounded-full p-1 w-7 h-7 flex items-center justify-center"
                    style={{ backgroundColor: `${categoryColor}1A` }}
                  >
                    {styleInfo?.iconSvg ? (
                      <div style={{ transform: 'scale(0.65)' }}>
                        <div
                          style={{ color: categoryColor }}
                          dangerouslySetInnerHTML={{
                            __html: styleInfo.iconSvg,
                          }}
                        />
                      </div>
                    ) : (
                      <TagIcon
                        className="w-3 h-3"
                        style={{ color: categoryColor }}
                      />
                    )}
                  </div>
                  <span className="font-medium">{displayName}</span>
                </button>
              );
            })}
      </div>

      <div className="mt-6 mb-6">
        <h3 className="font-medium text-sm mb-2">Status</h3>
        <div className="flex space-x-1">
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md ${statusFilter === 'active' ? selectedStatusClass : hoverStatusClass}`}
            onClick={() => handleStatusFilterClick('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded-md ${statusFilter === 'all' ? selectedStatusClass : hoverStatusClass}`}
            onClick={() => handleStatusFilterClick('all')}
          >
            All
          </button>
        </div>
      </div>
    </div>
  </div>
);

// Helper function to determine the day for a given timestamp
const getDayKey = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

// Helper to format end date display using date-fns
const formatEndDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return format(date, 'MMMM d, yyyy');
};

const ForecastingTable = () => {
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

  // State for text filter
  const [searchTerm, setSearchTerm] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Add state for filter sheet
  const [filterOpen, setFilterOpen] = React.useState(false);
  // Get mobile status
  const isMobile = useIsMobile();

  // Update the state when the URL parameter changes
  React.useEffect(() => {
    const currentCategorySlug = searchParams.get('category');
    // Basic validation: just set if it exists or is null
    setSelectedCategorySlug(currentCategorySlug);
  }, [searchParams]);

  // Handler for text filter changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const groupedMarketGroups: GroupedMarketGroup[] = React.useMemo(() => {
    if (!enrichedMarketGroups) return [];

    // 1. Filter enrichedMarketGroups by selected Category SLUG *before* flattening
    const filteredByCategory = enrichedMarketGroups.filter((marketGroup) => {
      if (selectedCategorySlug === null) return true; // Show all if no category selected

      const marketSlug = marketGroup.category?.slug;

      // Filter based on the actual category slug
      return marketSlug === selectedCategorySlug;
    });

    // 2. Map filteredMarketGroups to MarketWithContext[]
    const allMarkets: MarketWithContext[] = filteredByCategory.flatMap(
      (marketGroup) =>
        marketGroup.markets.map((market) => ({
          ...market, // Spread market details
          marketAddress: marketGroup.address,
          chainId: marketGroup.chainId,
          collateralAsset: marketGroup.collateralAsset,
          isYin: marketGroup.isYin,
          categorySlug: marketGroup.category.slug,
          categoryId: marketGroup.category.id,
        }))
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
        // Find the corresponding enrichedMarketGroup to get details
        // Use filteredByCategory to ensure we only consider market groups matching the slug filter
        const sourceMarketGroup = filteredByCategory.find(
          (m) => `${m.chainId}:${m.address}` === marketKey
        );

        // Find the FocusArea data that includes this market group's category slug
        const focusAreaStyle = FOCUS_AREAS.find(
          (fa) => fa.id === sourceMarketGroup?.category?.slug
        );
        const color = focusAreaStyle?.color ?? DEFAULT_CATEGORY_COLOR;

        acc[marketKey] = {
          key: marketKey,
          marketAddress: market.marketAddress,
          chainId: market.chainId,
          // Use sourceMarketGroup details safely
          marketName: sourceMarketGroup?.category?.name ?? 'Unknown Market',
          collateralAsset: market.collateralAsset,
          color,
          categorySlug: market.categorySlug,
          categoryId: market.categoryId,
          isYin: market.isYin,
          marketQuestion: undefined, // Initialize
          markets: [], // Initialize
          displayQuestion: undefined, // Initialize
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

        // Find active markets for this market group
        const now = Math.floor(Date.now() / 1000);
        const activeMarkets = groupedMarketGroup.markets.filter(
          (market) => now >= market.startTimestamp && now < market.endTimestamp
        );

        // Determine the raw question (will be formatted by MarketGroupsRow)
        let rawQuestion: string | null = null;

        // If we have multiple active markets, use market question
        if (activeMarkets.length > 1 && sourceMarketGroup?.question) {
          rawQuestion = sourceMarketGroup.question;
        }
        // If we have exactly one active market with a question, use that
        else if (activeMarkets.length === 1 && activeMarkets[0]?.question) {
          rawQuestion = activeMarkets[0].question;
        }
        // Fallback to market question
        else if (sourceMarketGroup?.question) {
          rawQuestion = sourceMarketGroup.question;
        }
        // Fallback to first market with a question
        else if (groupedMarketGroup.markets.length > 0) {
          const firstMarketWithQuestion = [...groupedMarketGroup.markets]
            .sort((a, b) => a.startTimestamp - b.startTimestamp)
            .find((market) => market.question);

          rawQuestion = firstMarketWithQuestion?.question || null;
        }

        // Format the question if we have one, otherwise use market name
        const displayQuestion =
          (rawQuestion ? formatQuestion(rawQuestion) : null) ||
          groupedMarketGroup.marketName;

        return {
          ...groupedMarketGroup,
          marketQuestion,
          displayQuestion,
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
        const now = Math.floor(Date.now() / 1000);
        const activeMarkets = marketGroup.markets.filter(
          (market) => now >= market.startTimestamp && now < market.endTimestamp
        );

        // Determine the timestamp to use for day grouping
        let timestamp;
        if (activeMarkets.length > 0) {
          // Sort by end time and get the earliest ending market
          timestamp = [...activeMarkets].sort(
            (a, b) => a.endTimestamp - b.endTimestamp
          )[0].endTimestamp;
        } else {
          // If no active markets, use the earliest ending market
          timestamp = [...marketGroup.markets].sort(
            (a, b) => a.endTimestamp - b.endTimestamp
          )[0].endTimestamp;
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
        marketGroup.markets.filter((market) => now < market.endTimestamp)
      );

      if (allActiveMarkets.length > 0) {
        // Sort by end time and get the one ending soonest
        const nextEndingMarket = [...allActiveMarkets].sort(
          (a, b) => a.endTimestamp - b.endTimestamp
        )[0];

        result[dayKey] = nextEndingMarket.endTimestamp;
      } else {
        // If no active markets, use the latest end time from any market
        const allMarkets = marketGroups.flatMap(
          (marketGroup) => marketGroup.markets
        );
        const latestEndingMarket = [...allMarkets].sort(
          (a, b) => b.endTimestamp - a.endTimestamp
        )[0];

        result[dayKey] = latestEndingMarket.endTimestamp;
      }
    });

    return result;
  }, [marketGroupsByDay]);

  // Sort days chronologically
  const sortedDays = React.useMemo(() => {
    return Object.keys(marketGroupsByDay).sort();
  }, [marketGroupsByDay]);

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
    router.replace(`/forecasting?${params.toString()}`);
  };

  const handleStatusFilterClick = (filter: 'all' | 'active') => {
    setStatusFilter(filter);
  };

  // Helper to find FocusArea data by category slug for UI styling
  const getCategoryStyle = (categorySlug: string): FocusArea | undefined => {
    // First try to find a matching focus area
    const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);

    if (focusArea) {
      return focusArea;
    }

    // If no matching focus area, create a deterministic color based on the slug
    // This ensures the same category always gets the same color
    const DEFAULT_COLORS = [
      '#3B82F6', // blue-500
      '#C084FC', // purple-400
      '#4ADE80', // green-400
      '#FBBF24', // amber-400
      '#F87171', // red-400
      '#22D3EE', // cyan-400
      '#FB923C', // orange-400
    ];

    // Use a simple hash function to get a consistent index
    const hashCode = categorySlug.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + (acc * 32 - acc);
    }, 0);

    const colorIndex = Math.abs(hashCode) % DEFAULT_COLORS.length;

    // Return a partial focus area with the minimal required properties
    return {
      id: categorySlug,
      name: '', // Will use category.name from database
      resources: [],
      color: DEFAULT_COLORS[colorIndex],
      iconSvg: '', // Will use default TagIcon
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
    <div className="flex flex-col md:flex-row min-h-0">
      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-16 lg:gap-10 pr-0 lg:pr-12">
        {/* Add Text Filter Input with inline filter button for mobile */}
        <div className="sticky top-20 md:top-0 z-10 bg-background/90 backdrop-blur-sm pt-2 pb-1">
          {/* Wrap Input and Icon */}
          <div className="relative flex items-center">
            <SearchIcon
              className="absolute left-0 h-full w-auto p-3 pl-2 text-muted-foreground opacity-40"
              strokeWidth={1}
            />
            <div className="flex-1 relative border-b border-muted-foreground/40">
              <Input
                type="text"
                placeholder={isMobile ? 'Search' : 'Search questions...'}
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full text-3xl font-heading font-normal bg-transparent rounded-none border-0 placeholder:text-foreground placeholder:opacity-20 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto py-3 pl-14"
              />
            </div>

            {/* Add inline filter button for mobile */}
            {isMobile && (
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-4 flex items-center justify-center opacity-40 hover:opacity-90 w-10 h-10 rounded-full"
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                    <span className="sr-only">Filter</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] pr-0">
                  {/* Add animation wrapper */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                  >
                    <FocusAreaFilter
                      selectedCategorySlug={selectedCategorySlug}
                      handleCategoryClick={handleCategoryClick}
                      statusFilter={statusFilter}
                      handleStatusFilterClick={handleStatusFilterClick}
                      isLoadingCategories={false}
                      categories={categories}
                      getCategoryStyle={getCategoryStyle}
                    />
                  </motion.div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        {/* Removed the inline loading checks here */}
        <div className="relative min-h-[300px]">
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

            {groupedMarketGroups.length > 0 && (
              <motion.div
                key="results-container"
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
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        {formatEndDate(dayEndTimes[dayKey])}
                      </h3>
                      <div className="border border-muted rounded-md shadow-sm bg-background/50 overflow-hidden">
                        {marketGroupsByDay[dayKey].map((marketGroup) => (
                          <motion.div
                            layout
                            key={marketGroup.key}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-b last:border-b-0 border-border"
                          >
                            <MarketGroupsRow
                              marketAddress={marketGroup.marketAddress}
                              chainId={marketGroup.chainId}
                              displayQuestion={
                                marketGroup.displayQuestion || 'Loading...'
                              }
                              color={marketGroup.color}
                              markets={marketGroup.markets}
                            />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop filter panel - sticky on the right side */}
      {!isMobile && (
        <div className="hidden md:block w-[280px] sticky top-20 max-h-[calc(100vh-5rem)] self-start overflow-y-auto">
          {/* Add animation wrapper */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeInOut', delay: 0.1 }} // Slight delay for desktop
          >
            <FocusAreaFilter
              selectedCategorySlug={selectedCategorySlug}
              handleCategoryClick={handleCategoryClick}
              statusFilter={statusFilter}
              handleStatusFilterClick={handleStatusFilterClick}
              isLoadingCategories={isLoadingCategories}
              categories={categories}
              getCategoryStyle={getCategoryStyle}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ForecastingTable;
