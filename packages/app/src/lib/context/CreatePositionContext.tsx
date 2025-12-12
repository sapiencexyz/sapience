'use client';

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';

// localStorage key for position selections persistence
const STORAGE_KEY_SELECTIONS = 'sapience:position-selections';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { createPositionDefaults } from '~/lib/utils/positionFormUtils';

// Updated CreatePositionEntry type based on requirements
export interface CreatePositionEntry {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
  chainId: number; // Add chainId to identify which chain the market is on
  wagerAmount?: string; // Store default wager amount
  marketClassification?: MarketGroupClassification; // Store classification for better form handling
}

// Lightweight position selection for OTC conditions (no on-chain market data)
export interface PositionSelection {
  id: string; // unique within position form
  conditionId: string;
  question: string;
  prediction: boolean; // true = yes, false = no
  categorySlug?: string | null; // category slug for icon display
}

// Interface for market data with position
export interface PositionWithMarketData {
  position: CreatePositionEntry;
  marketGroupData: undefined;
  marketClassification: MarketGroupClassification | undefined;
  isLoading: boolean;
  error: boolean | null;
}

interface CreatePositionContextType {
  // Separate lists: single positions (on-chain) and position selections (RFQ conditions)
  createPositionEntries: CreatePositionEntry[]; // legacy alias to singlePositions for backward compat
  singlePositions: CreatePositionEntry[];
  selections: PositionSelection[];
  addPosition: (position: Omit<CreatePositionEntry, 'id'>) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<CreatePositionEntry>) => void;
  clearPositionForm: () => void;
  // Position selections API
  addSelection: (selection: Omit<PositionSelection, 'id'>) => void;
  removeSelection: (id: string) => void;
  clearSelections: () => void;
  openPopover: () => void;
  isPopoverOpen: boolean;
  setIsPopoverOpen: (open: boolean) => void;
  // New properties for market data
  positionsWithMarketData: PositionWithMarketData[];
}

export const CreatePositionContext = createContext<
  CreatePositionContextType | undefined
>(undefined);

export const useCreatePositionContext = () => {
  const context = useContext(CreatePositionContext);
  if (!context) {
    throw new Error(
      'useCreatePositionContext must be used within a CreatePositionProvider'
    );
  }
  return context;
};

interface CreatePositionProviderProps {
  children: React.ReactNode;
}

export const CreatePositionProvider = ({
  children,
}: CreatePositionProviderProps) => {
  const [singlePositions, setSinglePositions] = useState<CreatePositionEntry[]>(
    []
  );
  const [selections, setSelections] = useState<PositionSelection[]>(() =>
    loadFromStorage(STORAGE_KEY_SELECTIONS, [])
  );
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Persist position selections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SELECTIONS, JSON.stringify(selections));
  }, [selections]);

  // Spot market functionality removed - positionsWithMarketData is empty
  const positionsWithMarketData: PositionWithMarketData[] = singlePositions.map(
    (position) => ({
      position,
      marketGroupData: undefined,
      marketClassification: position.marketClassification,
      isLoading: false,
      error: null,
    })
  );

  const addPosition = useCallback(
    (position: Omit<CreatePositionEntry, 'id'>) => {
      // Create intelligent defaults based on market classification
      const defaults = createPositionDefaults(position.marketClassification);

      // Special handling for YES/NO: treat the question as a single logical position
      if (
        position.marketClassification === MarketGroupClassificationEnum.YES_NO
      ) {
        const existingYesNoIndex = singlePositions.findIndex(
          (p) =>
            p.marketAddress === position.marketAddress &&
            p.marketClassification === MarketGroupClassificationEnum.YES_NO
        );

        if (existingYesNoIndex !== -1) {
          setSinglePositions((prev) =>
            prev.map((p, index) =>
              index === existingYesNoIndex
                ? {
                    ...p,
                    prediction: position.prediction,
                    marketId: position.marketId,
                    question: position.question,
                    marketClassification: position.marketClassification,
                    wagerAmount: p.wagerAmount || defaults.wagerAmount,
                  }
                : p
            )
          );
          setIsPopoverOpen(true);
          return;
        }
      }

      // Check if a position with the same marketAddress and marketId already exists
      const existingPositionIndex = singlePositions.findIndex(
        (p) =>
          p.marketAddress === position.marketAddress &&
          p.marketId === position.marketId
      );

      if (existingPositionIndex !== -1) {
        setSinglePositions((prev) =>
          prev.map((p, index) =>
            index === existingPositionIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  question: position.question,
                  marketClassification: position.marketClassification,
                  wagerAmount: p.wagerAmount || defaults.wagerAmount,
                }
              : p
          )
        );
      } else {
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;
        const enhancedPosition: CreatePositionEntry = {
          ...position,
          id,
          wagerAmount: position.wagerAmount || defaults.wagerAmount,
          prediction: position.prediction ?? defaults.prediction ?? false,
        };
        setSinglePositions((prev) => [...prev, enhancedPosition]);
      }

      setIsPopoverOpen(true);
    },
    [singlePositions]
  );

  const removePosition = useCallback(
    (id: string) => {
      const newPositions = singlePositions.filter((p) => p.id !== id);
      setSinglePositions(newPositions);
    },
    [singlePositions]
  );

  const updatePosition = useCallback(
    (id: string, updates: Partial<CreatePositionEntry>) => {
      setSinglePositions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const clearPositionForm = useCallback(() => {
    setSinglePositions([]);
  }, []);

  const openPopover = useCallback(() => {
    setIsPopoverOpen(true);
  }, []);

  const addSelection = useCallback(
    (selection: Omit<PositionSelection, 'id'>) => {
      setSelections((prev) => {
        const existingIndex = prev.findIndex(
          (s) => s.conditionId === selection.conditionId
        );

        if (existingIndex !== -1) {
          return prev.map((s, i) =>
            i === existingIndex ? { ...s, prediction: selection.prediction } : s
          );
        }

        const id = `${selection.conditionId}-${selection.prediction}-${Date.now()}`;
        return [...prev, { ...selection, id }];
      });
      setIsPopoverOpen(true);
    },
    []
  );

  const removeSelection = useCallback((id: string) => {
    setSelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearSelections = useCallback(() => {
    setSelections([]);
  }, []);

  const value: CreatePositionContextType = {
    createPositionEntries: singlePositions,
    singlePositions,
    selections,
    addPosition,
    removePosition,
    updatePosition,
    clearPositionForm,
    addSelection,
    removeSelection,
    clearSelections,
    openPopover,
    isPopoverOpen,
    setIsPopoverOpen,
    positionsWithMarketData,
  };

  return (
    <CreatePositionContext.Provider value={value}>
      {children}
    </CreatePositionContext.Provider>
  );
};
