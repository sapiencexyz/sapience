'use client';

import type React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

// Updated ParlayPosition type based on requirements
export interface ParlayPosition {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
}

interface ParlayContextType {
  parlayPositions: ParlayPosition[];
  addPosition: (position: Omit<ParlayPosition, 'id'>) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<ParlayPosition>) => void;
  clearParlay: () => void;
  openPopover: () => void;
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
}

const ParlayContext = createContext<ParlayContextType | undefined>(undefined);

export const useParlayContext = () => {
  const context = useContext(ParlayContext);
  if (!context) {
    throw new Error('useParlayContext must be used within a ParlayProvider');
  }
  return context;
};

interface ParlayProviderProps {
  children: React.ReactNode;
}

export const ParlayProvider = ({ children }: ParlayProviderProps) => {
  const [parlayPositions, setParlayPositions] = useState<ParlayPosition[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const addPosition = useCallback(
    (position: Omit<ParlayPosition, 'id'>) => {
      // Check if a position with the same marketAddress and marketId already exists
      const existingPositionIndex = parlayPositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      if (existingPositionIndex !== -1) {
        // Merge into existing position by updating it
        setParlayPositions((prev) =>
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

        const newPosition: ParlayPosition = {
          ...position,
          id,
        };
        setParlayPositions((prev) => [...prev, newPosition]);
      }

      setIsPopoverOpen(true); // Open popover when position is added or updated
    },
    [parlayPositions]
  );

  const removePosition = useCallback((id: string) => {
    setParlayPositions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePosition = useCallback(
    (id: string, updates: Partial<ParlayPosition>) => {
      setParlayPositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearParlay = useCallback(() => {
    setParlayPositions([]);
  }, []);

  const openPopover = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const value: ParlayContextType = {
    parlayPositions,
    addPosition,
    removePosition,
    updatePosition,
    clearParlay,
    openPopover,
    isPopoverOpen,
    setIsPopoverOpen,
  };

  return (
    <ParlayContext.Provider value={value}>{children}</ParlayContext.Provider>
  );
};
