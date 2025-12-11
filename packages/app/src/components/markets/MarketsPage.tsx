'use client';

import { useIsBelow } from '@sapience/sdk/ui/hooks/use-mobile';
import { useIsMobile } from '@sapience/sdk/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useState, useMemo, useCallback } from 'react';
import { useCategories } from '~/hooks/graphql/useCategories';
import {
  useConditions,
  type ConditionFilters,
} from '~/hooks/graphql/useConditions';
import CreatePositionForm from '~/components/markets/CreatePositionForm';
import ExampleCombos from '~/components/markets/ExampleCombos';
import MarketsDataTable from '~/components/markets/MarketsDataTable';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import type { FilterState } from '~/components/markets/TableFilters';
import { useDebouncedValue } from '~/hooks/useDebouncedValue';

// Dynamically import Loader
const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

// Helper to convert days from now to Unix timestamp
function daysFromNowToTimestamp(days: number): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec + days * 86400;
}

const MarketsPage = () => {
  const { data: allCategories = [], isLoading: isLoadingCategories } =
    useCategories();

  // Read chainId from localStorage with event monitoring
  const chainId = useChainIdFromLocalStorage();

  // Filter state managed here, passed down to MarketsDataTable
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    openInterestRange: [0, 100000],
    timeToResolutionRange: [0, 1000], // Default to future markets only
    selectedCategories: [],
  });

  // Debounce search term for backend queries (300ms)
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Convert UI filter state to backend filter format
  const backendFilters = useMemo((): ConditionFilters => {
    const result: ConditionFilters = {
      publicOnly: true, // Always filter to public conditions
    };

    // Search filter (debounced)
    if (debouncedSearchTerm.trim()) {
      result.search = debouncedSearchTerm.trim();
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      result.categorySlugs = filters.selectedCategories;
    }

    // Time to resolution filter (convert days to timestamps)
    const [minDays, maxDays] = filters.timeToResolutionRange;
    // Only apply if not at the extreme bounds (-1000 to 1000)
    if (minDays > -1000) {
      result.endTimeGte = daysFromNowToTimestamp(minDays);
    }
    if (maxDays < 1000) {
      result.endTimeLte = daysFromNowToTimestamp(maxDays);
    }

    return result;
  }, [debouncedSearchTerm, filters]);

  // RFQ Conditions via GraphQL with backend filtering
  const { data: allConditions = [], isLoading: isLoadingConditions } =
    useConditions({
      take: 200,
      chainId,
      filters: backendFilters,
    });

  // Callbacks for filter changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  // Convert categories to the format expected by TableFilters
  const categoryOptions = useMemo(() => {
    return allCategories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCategories]);

  // Get mobile/compact status
  const isMobile = useIsMobile();
  const isCompact = useIsBelow(1024);

  // Show loader only on initial load (not when filtering)
  if (isLoadingCategories) {
    return (
      <div
        className="flex justify-center items-center w-full"
        style={{
          minHeight: 'calc(100dvh - var(--page-top-offset, 0px))',
        }}
      >
        <Loader size={16} />
      </div>
    );
  }

  // Render content once loaded
  return (
    <div className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start">
      {/* Render only one position form instance based on viewport */}
      {isCompact ? (
        <div className="block lg:hidden">
          <CreatePositionForm />
        </div>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-4 pr-0 lg:pr-4 pb-4 lg:pb-6">
        {/* Featured Parlays section */}
        <ExampleCombos className="mt-4 md:mt-0" />

        {/* Results area - always table view */}
        <div className="relative w-full max-w-full overflow-x-hidden min-h-[300px]">
          <motion.div
            key="table-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <MarketsDataTable
              conditions={allConditions}
              isLoading={isLoadingConditions}
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              categories={categoryOptions}
            />
          </motion.div>
        </div>
      </div>

      {/* Desktop/Tablet sticky position form sidebar */}
      {!isMobile ? (
        <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-1 xl:ml-2 lg:mr-6">
          <div
            className="rounded-none shadow-lg overflow-hidden"
            style={{
              height: 'calc(100dvh - var(--page-top-offset, 0px))',
            }}
          >
            <div className="h-full overflow-y-auto">
              <CreatePositionForm variant="panel" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarketsPage;
