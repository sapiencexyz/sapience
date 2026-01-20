'use client';

import {
  CreatePythPredictionForm,
  type CreatePythPredictionFormValues,
  type PythPrediction,
} from '@sapience/ui';
import { useIsBelow } from '@sapience/ui/hooks/use-mobile';
import { motion } from 'framer-motion';
import { useState, useMemo, useCallback, useEffect } from 'react';

import CreatePositionForm from '~/components/markets/CreatePositionForm';
import ExampleCombos from '~/components/markets/ExampleCombos';
import MarketsDataTable from '~/components/markets/MarketsDataTable';
import type { FilterState } from '~/components/markets/TableFilters';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useCategories } from '~/hooks/graphql/useCategories';
import {
  useConditionGroups,
  type ConditionGroupFilters,
} from '~/hooks/graphql/useConditionGroups';
import {
  useConditions,
  type ConditionFilters,
} from '~/hooks/graphql/useConditions';
import { useDebouncedValue } from '~/hooks/useDebouncedValue';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

const PREDICT_PRICES_FLAG_KEY = 'sapience.flags.markets.predictPrices';

function isEnabledFlagValue(raw: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.toLowerCase().trim();
  return normalized === '1' || normalized === 'true';
}

const MarketsPage = () => {
  const { data: allCategories = [], isLoading: isLoadingCategories } =
    useCategories();

  const chainId = CHAIN_ID_ETHEREAL;

  // Get compact status (needed by callbacks below)
  const isCompact = useIsBelow(1024);

  const [showPredictPrices, setShowPredictPrices] = useState(false);

  const { openPopover } = useCreatePositionContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readFromStorage = (): boolean => {
      try {
        return isEnabledFlagValue(
          window.localStorage.getItem(PREDICT_PRICES_FLAG_KEY)
        );
      } catch {
        return false;
      }
    };

    const clearUrlParam = (url: URL): void => {
      url.searchParams.delete('predictPrices');
      window.history.replaceState({}, '', url.toString());
    };

    try {
      const url = new URL(window.location.href);
      const param = url.searchParams.get('predictPrices');

      if (isEnabledFlagValue(param)) {
        try {
          window.localStorage.setItem(PREDICT_PRICES_FLAG_KEY, '1');
        } catch {
          // Storage unavailable
        }
        clearUrlParam(url);
        setShowPredictPrices(true);
        return;
      }

      if (param === '0' || param?.toLowerCase() === 'false') {
        try {
          window.localStorage.removeItem(PREDICT_PRICES_FLAG_KEY);
        } catch {
          // Storage unavailable
        }
        clearUrlParam(url);
        setShowPredictPrices(false);
        return;
      }

      setShowPredictPrices(readFromStorage());
    } catch {
      setShowPredictPrices(readFromStorage());
    }
  }, []);

  // Filter state managed here, passed down to MarketsDataTable
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    openInterestRange: [0, Infinity],
    timeToResolutionRange: [0, Infinity], // Default to future markets only
    selectedCategories: [],
  });

  const [pythPredictions, setPythPredictions] = useState<PythPrediction[]>([]);

  // Debounce search term for backend queries (300ms)
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Convert UI filter state to backend filter format for ungrouped conditions
  const backendConditionFilters = useMemo((): ConditionFilters => {
    const result: ConditionFilters = {
      publicOnly: true, // Always filter to public conditions
      ungroupedOnly: true, // Only fetch conditions without a group
    };

    // Search filter (debounced)
    if (debouncedSearchTerm.trim()) {
      result.search = debouncedSearchTerm.trim();
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      result.categorySlugs = filters.selectedCategories;
    }

    // Note: Time to resolution and open interest filters are applied client-side
    // because they need to apply to group aggregates as well

    return result;
  }, [debouncedSearchTerm, filters.selectedCategories]);

  // Convert UI filter state to backend filter format for condition groups
  const backendGroupFilters = useMemo((): ConditionGroupFilters => {
    const result: ConditionGroupFilters = {
      publicOnly: true, // Filter to groups with public conditions
    };

    // Search filter (debounced) - searches group name
    if (debouncedSearchTerm.trim()) {
      result.search = debouncedSearchTerm.trim();
    }

    // Category filter
    if (filters.selectedCategories.length > 0) {
      result.categorySlugs = filters.selectedCategories;
    }

    return result;
  }, [debouncedSearchTerm, filters.selectedCategories]);

  // Fetch condition groups with their conditions
  const { data: conditionGroups = [], isLoading: isLoadingGroups } =
    useConditionGroups({
      take: 200,
      chainId,
      filters: backendGroupFilters,
    });

  // Fetch ungrouped conditions via GraphQL with backend filtering
  const { data: ungroupedConditions = [], isLoading: isLoadingConditions } =
    useConditions({
      take: 200,
      chainId,
      filters: backendConditionFilters,
    });

  // Combined loading state
  const isLoadingData = isLoadingGroups || isLoadingConditions;

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

      // Mobile UX: open the bet slip drawer so users can see their selection
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
      className="relative w-full max-w-full overflow-visible flex flex-col lg:flex-row items-start"
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
      <div className="flex-1 min-w-0 max-w-full overflow-visible flex flex-col gap-4 pr-0 lg:pr-4 pb-4 lg:pb-6">
        {/* Featured Positions section */}
        <ExampleCombos className="mt-4 md:mt-0" />

        {showPredictPrices && (
          <div className="w-full mt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="sc-heading text-foreground">Predict Prices</h2>
            </div>
            <CreatePythPredictionForm onPick={handlePythPick} />
            <hr className="gold-hr mt-6 -mb-2" />
          </div>
        )}

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
              conditionGroups={conditionGroups}
              ungroupedConditions={ungroupedConditions}
              isLoading={isLoadingData}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filters={filters}
              onFiltersChange={setFilters}
              categories={categoryOptions}
            />
          </motion.div>
        </div>
      </div>

      {/* Desktop/Tablet sticky position form sidebar */}
      {!isCompact && (
        <div className="hidden lg:block w-[24rem] shrink-0 self-start sticky top-24 z-30 lg:ml-1 xl:ml-2 lg:mr-6">
          <div
            className="rounded-none shadow-lg overflow-hidden"
            style={{
              height: 'calc(100dvh - var(--page-top-offset, 0px))',
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
