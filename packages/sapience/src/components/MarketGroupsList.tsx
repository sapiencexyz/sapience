'use client';

import { Skeleton } from '@foil/ui/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { FrownIcon, LayoutGridIcon } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { DEFAULT_FOCUS_AREA, FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { type ResourceSlug } from '~/lib/constants/resources';
import { useMarketGroups, type Epoch } from '~/lib/hooks/useMarketGroups';

import { MarketGroupPreview } from './MarketGroupPreview';

// Constants for button classes
const selectedStatusClass = 'bg-secondary';
const hoverStatusClass = 'hover:bg-secondary/50';

// Interface for epoch data including market/resource info
interface EpochWithMarketInfo extends Epoch {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  isYin: boolean;
  resourceSlug: ResourceSlug;
  resourceName: string;
  iconPath: string;
}

// Interface for the final grouped market data structure
interface MarketGroup {
  key: string;
  marketAddress: string;
  chainId: number;
  marketName: string;
  iconPath: string;
  collateralAsset: string;
  color: string;
  focusAreaSlug: string;
  isYin: boolean;
  epochs: EpochWithMarketInfo[];
}

const PredictionsTable = () => {
  const { data: resources, isLoading: isLoadingResources } = useMarketGroups();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get the focus area from the URL query parameter, default to null (all)
  const focusParam = searchParams.get('focus');
  const [selectedFocusArea, setSelectedFocusArea] = React.useState<
    string | null
  >(
    focusParam && FOCUS_AREAS.some((area) => area.id === focusParam)
      ? focusParam
      : null // Default to null (all)
  );

  // Add state for the active/settled toggle
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active'>(
    'active'
  );

  // Update the state when the URL parameter changes
  React.useEffect(() => {
    const currentFocus = searchParams.get('focus');
    if (currentFocus && FOCUS_AREAS.some((area) => area.id === currentFocus)) {
      setSelectedFocusArea(currentFocus);
    } else if (!currentFocus) {
      setSelectedFocusArea(null);
    } // Else: keep existing state if param is invalid
  }, [searchParams]);

  // --- Refactored useMemo with strong types ---
  const groupedMarketData: MarketGroup[] = React.useMemo(() => {
    if (!resources) return [];

    // 1. Flatten all epochs with necessary market/resource info
    const allEpochs: EpochWithMarketInfo[] = resources.flatMap((resource) =>
      resource.markets.flatMap((market) =>
        market.epochs.map((epoch) => ({
          ...epoch,
          marketAddress: market.address,
          chainId: market.chainId,
          collateralAsset: market.collateralAsset,
          isYin: market.isYin,
          resourceSlug: resource.slug,
          resourceName: resource.name,
          iconPath: resource.iconPath,
        }))
      )
    );

    // 2. Filter epochs based on focus area and status
    const filteredEpochs: EpochWithMarketInfo[] = allEpochs.filter((epoch) => {
      // Filter out invalid timestamps early
      if (typeof epoch.endTimestamp !== 'number' || epoch.endTimestamp <= 0) {
        console.warn('Filtering out epoch with invalid endTimestamp:', epoch);
        return false;
      }

      // Filter by focus area
      if (selectedFocusArea !== null) {
        const focusArea = FOCUS_AREAS.find(
          (area) => area.id === selectedFocusArea
        );
        if (!focusArea || !focusArea.resources.includes(epoch.resourceSlug)) {
          return false;
        }
      }
      // Filter by public status (if needed, schema shows public on epoch)
      if (!epoch.public) return false;

      // Filter by active/settled status
      const now = Math.floor(Date.now() / 1000);
      if (statusFilter === 'active') {
        return now <= epoch.endTimestamp;
      }
      // 'all' filter doesn't filter by time, only public status applied earlier
      return true;
    });

    // 3. Group filtered epochs by market key
    const groupedByMarket = filteredEpochs.reduce<{
      [key: string]: MarketGroup;
    }>((acc, epoch) => {
      const marketKey = `${epoch.chainId}:${epoch.marketAddress}`;
      if (!acc[marketKey]) {
        // Find the focus area info once per market
        const matchingFocusArea = FOCUS_AREAS.find((area) =>
          area.resources.includes(epoch.resourceSlug)
        );
        const color = matchingFocusArea?.color || DEFAULT_FOCUS_AREA.color;
        const focusAreaSlug = matchingFocusArea
          ? matchingFocusArea.name.toLowerCase().replace(/\s+/g, '-')
          : 'unknown';

        acc[marketKey] = {
          key: marketKey,
          marketAddress: epoch.marketAddress,
          chainId: epoch.chainId,
          marketName: epoch.resourceName, // Using resource name as market name
          iconPath: epoch.iconPath,
          collateralAsset: epoch.collateralAsset,
          color,
          focusAreaSlug,
          isYin: epoch.isYin,
          epochs: [], // Initialize epochs array for this market
        };
      }
      acc[marketKey].epochs.push(epoch); // Add the epoch to its market group
      return acc;
    }, {});

    // 4. Convert the grouped object back to an array
    return Object.values(groupedByMarket);
  }, [resources, selectedFocusArea, statusFilter]);
  // --- End of refactored useMemo ---

  const handleFocusAreaClick = (focusAreaId: string | null) => {
    setSelectedFocusArea(focusAreaId);
    const params = new URLSearchParams(searchParams);
    if (focusAreaId === null) {
      params.delete('focus');
    } else {
      params.set('focus', focusAreaId);
    }
    // Use replace to avoid adding to history for filter changes
    router.replace(`/predictions?${params.toString()}`);
  };

  const handleStatusFilterClick = (filter: 'all' | 'active') => {
    setStatusFilter(filter);
    // Note: Status is not currently in URL params, only local state
  };

  return (
    <div className="grid grid-cols-[1fr_280px] gap-0">
      {/* Main Content */}
      <div className="pr-6">
        {isLoadingResources && (
          // Show skeleton loaders for the main list while resources are loading
          <div className="space-y-12 flex flex-col pt-10">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton
                  className="h-40 w-full border-t-[6px]"
                  style={{ borderTopColor: DEFAULT_FOCUS_AREA.color }}
                />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-5/6" />
              </div>
            ))}
          </div>
        )}
        {/* Container for list and zero-state using popLayout */}
        {!isLoadingResources && (
          <div className="relative min-h-[300px] pt-10">
            {' '}
            {/* Relative parent, added pt-10 */}
            <AnimatePresence mode="popLayout">
              {' '}
              {/* Use popLayout */}
              {/* Zero State */}
              {groupedMarketData.length === 0 && (
                <motion.div
                  key="zero-state" // Key needed for AnimatePresence
                  layout // Allow popLayout to manage position
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full pt-48 text-center text-muted-foreground"
                >
                  <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
                  No forecasting markets match the selected filters.
                </motion.div>
              )}
              {/* List Items - Mapped directly inside outer AnimatePresence */}
              {groupedMarketData.map((marketGroup) => (
                <motion.div
                  layout // Keep layout for item positioning
                  key={marketGroup.key}
                  initial={{ opacity: 0, scale: 0.98, y: 0 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 0 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="mb-12" // Added margin-bottom for spacing
                >
                  <MarketGroupPreview
                    chainId={marketGroup.chainId}
                    marketAddress={marketGroup.marketAddress}
                    epochs={marketGroup.epochs}
                    color={marketGroup.color}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Right Sidebar - Navigation */}
      <div className="p-5 sticky top-0 self-start mt-10">
        <div className="pb-2">
          <h3 className="font-medium text-sm mb-3">Focus Areas</h3>
          <div className="space-y-1">
            {/* "All Focus Areas" button */}
            <button
              type="button"
              onClick={() => handleFocusAreaClick(null)}
              className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors text-xs ${
                selectedFocusArea === null
                  ? selectedStatusClass
                  : hoverStatusClass
              }`}
            >
              <div
                className="rounded-full p-1 w-5 h-5 flex items-center justify-center"
                style={{ backgroundColor: `${DEFAULT_FOCUS_AREA.color}25` }}
              >
                <LayoutGridIcon
                  className="w-2.5 h-2.5"
                  style={{ color: DEFAULT_FOCUS_AREA.color }}
                />
              </div>
              <span className="font-medium">All Focus Areas</span>
            </button>
            {/* Individual Focus Area buttons */}
            {FOCUS_AREAS.map((area) => (
              <button
                type="button"
                key={area.id}
                onClick={() => handleFocusAreaClick(area.id)}
                className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors text-xs ${
                  selectedFocusArea === area.id
                    ? selectedStatusClass
                    : hoverStatusClass
                }`}
              >
                <div
                  className="rounded-full p-1 w-5 h-5 flex items-center justify-center"
                  style={{ backgroundColor: `${area.color}25` }}
                >
                  {/* eslint-disable-next-line react/no-danger */}
                  <div
                    className="w-2.5 h-2.5 flex items-center justify-center"
                    style={{ color: area.color }}
                    dangerouslySetInnerHTML={{ __html: area.iconSvg }}
                  />
                </div>
                <span className="font-medium">{area.name}</span>
              </button>
            ))}
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
    </div>
  );
};

export default PredictionsTable;
