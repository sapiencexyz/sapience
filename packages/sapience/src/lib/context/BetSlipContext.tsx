'use client';

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';
import type { MarketGroupClassification } from '~/lib/types';
import { createPositionDefaults } from '~/lib/utils/betslipUtils';
import {
  marketGroupQueryConfig,
  getMarketGroupFromCache,
  prefetchMarketGroup,
  normalizeMarketIdentifier,
} from '~/hooks/graphql/useMarketGroup';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

// Updated BetSlipPosition type based on requirements
export interface BetSlipPosition {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
  chainId: number; // Add chainId to identify which chain the market is on
  wagerAmount?: string; // Store default wager amount
  marketClassification?: MarketGroupClassification; // Store classification for better form handling
}

// Lightweight parlay selection for OTC conditions (no on-chain market data)
export interface ParlaySelection {
  id: string; // unique within betslip
  conditionId: string;
  question: string;
  prediction: boolean; // true = yes, false = no
}

// Interface for market data with position
export interface PositionWithMarketData {
  position: BetSlipPosition;
  marketGroupData: MarketGroupType | undefined;
  marketClassification: MarketGroupClassification | undefined;
  isLoading: boolean;
  error: boolean | null;
}

interface BetSlipContextType {
  // Separate lists: single positions (on-chain) and parlay selections (RFQ conditions)
  betSlipPositions: BetSlipPosition[]; // legacy alias to singlePositions for backward compat
  singlePositions: BetSlipPosition[];
  parlaySelections: ParlaySelection[];
  addPosition: (position: Omit<BetSlipPosition, 'id'>) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<BetSlipPosition>) => void;
  clearBetSlip: () => void;
  // Parlay selections API
  addParlaySelection: (selection: Omit<ParlaySelection, 'id'>) => void;
  updateParlaySelection: (
    id: string,
    updates: Partial<Omit<ParlaySelection, 'id' | 'conditionId'>>
  ) => void;
  removeParlaySelection: (id: string) => void;
  clearParlaySelections: () => void;
  openPopover: () => void;
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
  // New properties for market data
  positionsWithMarketData: PositionWithMarketData[];
}

const BetSlipContext = createContext<BetSlipContextType | undefined>(undefined);

export const useBetSlipContext = () => {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error('useBetSlipContext must be used within a BetSlipProvider');
  }
  return context;
};

interface BetSlipProviderProps {
  children: React.ReactNode;
}

export const BetSlipProvider = ({ children }: BetSlipProviderProps) => {
  const [singlePositions, setSinglePositions] = useState<BetSlipPosition[]>([]);
  const [parlaySelections, setParlaySelections] = useState<ParlaySelection[]>(
    []
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const queryClient = useQueryClient();
  const [_queryVersion, setQueryVersion] = useState(0);

  // Subscribe to React Query cache updates for marketGroup queries so the
  // provider re-renders when loading/data/error changes
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const q = (event as unknown as { query?: { queryKey?: unknown[] } })
        ?.query;
      if (Array.isArray(q?.queryKey) && q?.queryKey?.[0] === 'marketGroup') {
        setQueryVersion((v) => v + 1);
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  // Create positions with market data from cache
  const positionsWithMarketData = singlePositions.map((position) => {
    // Use same fallback logic for consistency
    const effectiveChainId = position.chainId || 8453;
    const normalizedIdentifier = normalizeMarketIdentifier(
      position.marketAddress
    );
    const queryKey = marketGroupQueryConfig.queryKey(
      normalizedIdentifier,
      effectiveChainId
    );

    // Get data from cache
    const marketGroupData = getMarketGroupFromCache(
      queryClient,
      effectiveChainId,
      position.marketAddress
    );
    const queryState = queryClient.getQueryState(queryKey);
    const isLoading =
      !marketGroupData &&
      (queryState ? queryState?.fetchStatus === 'fetching' : true);
    const isError = !marketGroupData && !!queryState?.error;

    // Determine market classification, preferring any explicit classification on the position
    const computedClassification = marketGroupData
      ? getMarketGroupClassification(marketGroupData)
      : undefined;
    const marketClassification =
      position.marketClassification ?? computedClassification;

    return {
      position: {
        ...position,
        chainId: effectiveChainId, // Ensure position has chainId for UI display
      },
      marketGroupData,
      marketClassification,
      isLoading,
      error: isError,
    };
  });

  const addPosition = useCallback(
    async (position: Omit<BetSlipPosition, 'id'>) => {
      // Check if a position with the same marketAddress and marketId already exists
      const existingPositionIndex = singlePositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      // Create intelligent defaults based on market classification
      const defaults = createPositionDefaults(position.marketClassification);

      if (existingPositionIndex !== -1) {
        // Merge into existing position by updating it
        setSinglePositions((prev) =>
          prev.map((p, index) =>
            index === existingPositionIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  question: position.question,
                  marketClassification: position.marketClassification,
                  // Preserve existing wager amount if it exists, otherwise use default
                  wagerAmount: p.wagerAmount || defaults.wagerAmount,
                }
              : p
          )
        );

        // Ensure market data is available (re)prefetch in case it was evicted or never fetched
        const effectiveChainId = position.chainId || 8453;
        await prefetchMarketGroup(
          queryClient,
          effectiveChainId,
          position.marketAddress
        );
      } else {
        // Generate a unique ID for the new position
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;

        // Apply intelligent defaults for new positions
        const enhancedPosition: BetSlipPosition = {
          ...position,
          id,
          // Apply defaults while allowing explicit overrides
          wagerAmount: position.wagerAmount || defaults.wagerAmount,
          prediction: position.prediction ?? defaults.prediction ?? false,
        };

        const newPositions = [...singlePositions, enhancedPosition];
        setSinglePositions(newPositions);

        // Fetch market data for new markets
        const effectiveChainId = position.chainId || 8453;
        await prefetchMarketGroup(
          queryClient,
          effectiveChainId,
          position.marketAddress
        );
      }

      setIsPopoverOpen(true); // Open popover when position is added or updated
    },
    [singlePositions, queryClient]
  );

  // Background ensure: prefetch any missing market data for positions currently in the betslip
  useEffect(() => {
    (() => {
      for (const position of singlePositions) {
        const effectiveChainId = position.chainId || 8453;
        const existing = getMarketGroupFromCache(
          queryClient,
          effectiveChainId,
          position.marketAddress
        );
        if (!existing) {
          // Fire and forget; internal prefetch handles dedupe and errors
          prefetchMarketGroup(
            queryClient,
            effectiveChainId,
            position.marketAddress
          );
        }
      }
    })();
  }, [singlePositions, queryClient]);

  const removePosition = useCallback(
    (id: string) => {
      const newPositions = singlePositions.filter((p) => p.id !== id);
      setSinglePositions(newPositions);
    },
    [singlePositions]
  );

  const updatePosition = useCallback(
    (id: string, updates: Partial<BetSlipPosition>) => {
      setSinglePositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearBetSlip = useCallback(() => {
    setSinglePositions([]);
  }, []);

  const openPopover = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const addParlaySelection = useCallback(
    (selection: Omit<ParlaySelection, 'id'>) => {
      const existingIndex = parlaySelections.findIndex(
        (s) => s.conditionId === selection.conditionId
      );
      if (existingIndex !== -1) {
        setParlaySelections((prev) =>
          prev.map((s, i) =>
            i === existingIndex ? { ...s, prediction: selection.prediction } : s
          )
        );
      } else {
        const id = `${selection.conditionId}-${selection.prediction}-${Date.now()}`;
        setParlaySelections((prev) => [...prev, { ...selection, id }]);
      }
      setIsPopoverOpen(true);
    },
    [parlaySelections]
  );

  const updateParlaySelection = useCallback(
    (
      id: string,
      updates: Partial<Omit<ParlaySelection, 'id' | 'conditionId'>>
    ) => {
      setParlaySelections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const removeParlaySelection = useCallback((id: string) => {
    setParlaySelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearParlaySelections = useCallback(() => {
    setParlaySelections([]);
  }, []);

  const value: BetSlipContextType = {
    // Keep legacy alias for compatibility
    betSlipPositions: singlePositions,
    singlePositions,
    parlaySelections,
    addPosition,
    removePosition,
    updatePosition,
    clearBetSlip,
    addParlaySelection,
    updateParlaySelection,
    removeParlaySelection,
    clearParlaySelections,
    openPopover,
    isPopoverOpen,
    setIsPopoverOpen,
    positionsWithMarketData,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};
