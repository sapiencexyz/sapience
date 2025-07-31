'use client';

import type React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

// Updated BetSlipPosition type based on requirements
export interface BetSlipPosition {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
  chainId: number; // Add chainId to identify which chain the market is on
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

  const addPosition = useCallback(
    (position: Omit<BetSlipPosition, 'id'>) => {
      // Check if a position with the same marketAddress and marketId already exists
      const existingPositionIndex = betSlipPositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      if (existingPositionIndex !== -1) {
        // Merge into existing position by updating it
        setBetSlipPositions((prev) =>
          prev.map((p, index) =>
            index === existingPositionIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  question: position.question,
                }
              : p
          )
        );
      } else {
        // Generate a unique ID for the new position
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;

        const newPosition: BetSlipPosition = {
          ...position,
          id,
        };
        setBetSlipPositions((prev) => [...prev, newPosition]);
      }

      setIsPopoverOpen(true); // Open popover when position is added or updated
    },
    [betSlipPositions]
  );

  const removePosition = useCallback((id: string) => {
    setBetSlipPositions((prev) => prev.filter((p) => p.id !== id));
  }, []);

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
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};
