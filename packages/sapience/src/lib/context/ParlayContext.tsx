'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

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

  const addPosition = useCallback((position: Omit<ParlayPosition, 'id'>) => {
    // Generate a unique ID for the position
    const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;
    
    // Check if this exact position already exists
    const existingPosition = parlayPositions.find(
      p => 
        p.marketAddress === position.marketAddress &&
        p.marketId === position.marketId &&
        p.prediction === position.prediction
    );

    if (!existingPosition) {
      const newPosition: ParlayPosition = {
        ...position,
        id,
      };
      setParlayPositions(prev => [...prev, newPosition]);
      setIsPopoverOpen(true); // Open popover when position is added
    }
  }, [parlayPositions]);

  const removePosition = useCallback((id: string) => {
    setParlayPositions(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePosition = useCallback((id: string, updates: Partial<ParlayPosition>) => {
    setParlayPositions(prev =>
      prev.map(p => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

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
    <ParlayContext.Provider value={value}>
      {children}
    </ParlayContext.Provider>
  );
}; 