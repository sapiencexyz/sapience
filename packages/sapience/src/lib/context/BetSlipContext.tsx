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

// Interface for market data with position
export interface PositionWithMarketData {
  position: BetSlipPosition;
  marketGroupData: MarketGroupType | undefined;
  marketClassification: MarketGroupClassification | undefined;
  isLoading: boolean;
  error: boolean | null;
}

interface BetSlipContextType {
  betSlipPositions: BetSlipPosition[];
  addPosition: (position: Omit<BetSlipPosition, 'id'>) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<BetSlipPosition>) => void;
  clearBetSlip: () => void;
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
  const [betSlipPositions, setBetSlipPositions] = useState<BetSlipPosition[]>(
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
  const positionsWithMarketData = betSlipPositions.map((position) => {
    // Use same fallback logic for consistency
    const effectiveChainId = position.chainId || 8453;
    const queryKey = marketGroupQueryConfig.queryKey(
      effectiveChainId,
      position.marketAddress
    );

    // Get data from cache
    const marketGroupData = getMarketGroupFromCache(
      queryClient,
      effectiveChainId,
      position.marketAddress
    );
    const queryState = queryClient.getQueryState(queryKey);
    const isLoading =
      !marketGroupData && queryState?.fetchStatus === 'fetching';
    const isError = !marketGroupData && !!queryState?.error;

    // Get market classification from the data
    const marketClassification = marketGroupData
      ? getMarketGroupClassification(marketGroupData)
      : undefined;

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
      const existingPositionIndex = betSlipPositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      // Create intelligent defaults based on market classification
      const defaults = createPositionDefaults(position.marketClassification);

      if (existingPositionIndex !== -1) {
        // Merge into existing position by updating it
        setBetSlipPositions((prev) =>
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

        const newPositions = [...betSlipPositions, enhancedPosition];
        setBetSlipPositions(newPositions);

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
    [betSlipPositions, queryClient]
  );

  const removePosition = useCallback(
    (id: string) => {
      const newPositions = betSlipPositions.filter((p) => p.id !== id);
      setBetSlipPositions(newPositions);
    },
    [betSlipPositions]
  );

  const updatePosition = useCallback(
    (id: string, updates: Partial<BetSlipPosition>) => {
      setBetSlipPositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearBetSlip = useCallback(() => {
    setBetSlipPositions([]);
  }, []);

  const openPopover = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const value: BetSlipContextType = {
    betSlipPositions,
    addPosition,
    removePosition,
    updatePosition,
    clearBetSlip,
    openPopover,
    isPopoverOpen,
    setIsPopoverOpen,
    positionsWithMarketData,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};
