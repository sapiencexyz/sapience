'use client';

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { z } from 'zod';

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
import type { Address, Hex } from 'viem';
import type { Pick as EscrowPick } from '@sapience/sdk/types';
import { OutcomeSide } from '@sapience/sdk/types';
import {
  computePickConfigId,
  canonicalizePicks,
} from '@sapience/sdk/auction/escrowEncoding';
import { DEFAULT_POSITION_SIZE } from '~/lib/utils/positionFormUtils';
import { fetchConditionsByIds } from '~/hooks/graphql/fetchConditionsByIds';

// Updated CreatePositionEntry type based on requirements
interface CreatePositionEntry {
  id: string;
  prediction: boolean;
  marketAddress: string;
  marketId: number;
  question: string;
  chainId: number; // Add chainId to identify which chain the market is on
  positionSize?: string; // Store default position size
}

// Lightweight position selection for OTC conditions (no on-chain market data)
interface PositionSelection {
  id: string; // unique within position form
  conditionId: string;
  question: string; // Full question text (always shown in tooltips)
  shortName?: string | null; // Short display name (used in CreatePositionForm only)
  prediction: boolean; // true = yes, false = no
  categorySlug?: string | null; // category slug for icon display
  resolverAddress?: string | null; // resolver address for canonical links
  endTime?: number | null; // Unix timestamp in seconds for filtering expired conditions
}

// Zod schema for validating PositionSelection from URL params
const positionSelectionSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  question: z.string(),
  shortName: z.string().nullable().optional(),
  prediction: z.boolean(),
  categorySlug: z.string().nullable().optional(),
  resolverAddress: z.string().nullable().optional(),
  endTime: z.number().nullable().optional(),
});

const positionSelectionsSchema = z.array(positionSelectionSchema);

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
  // Escrow protocol helpers
  /** Convert current selections to Pick[] array */
  getPolymarketPicks: () => EscrowPick[];
  /** Compute pickConfigId from current selections */
  getPickConfigId: () => Hex | null;
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
  const [selections, setSelections] = useState<PositionSelection[]>(() => {
    if (typeof window === 'undefined') return [];

    // URL query param takes priority over localStorage
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get('position');
      if (encoded) {
        const parsed = positionSelectionsSchema.safeParse(
          JSON.parse(decodeURIComponent(escape(atob(encoded))))
        );
        if (parsed.success && parsed.data.length > 0) {
          return parsed.data;
        }
      }
    } catch {
      // ignore malformed position param, fall through to localStorage
    }

    return loadFromStorage<PositionSelection[]>(STORAGE_KEY_SELECTIONS, []);
  });
  const [isPopoverOpen, setIsPopoverOpen] = useState(() => {
    // Auto-open popover if loaded from a slip URL
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return !!params.get('position');
    } catch {
      return false;
    }
  });

  // Clean up slip param from URL after hydrating (avoid re-triggering on navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('position')) {
      params.delete('position');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Persist position selections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SELECTIONS, JSON.stringify(selections));
  }, [selections]);

  // Remove settled conditions from the prediction slip on mount
  useEffect(() => {
    const conditionIds = selections.map((s) => s.conditionId);
    if (conditionIds.length === 0) return;

    const QUERY = /* GraphQL */ `
      query ConditionsByIds($where: ConditionWhereInput!) {
        conditions(where: $where, take: 100) {
          id
          settled
        }
      }
    `;

    fetchConditionsByIds<{ id: string; settled: boolean }>(QUERY, conditionIds)
      .then((conditions) => {
        const settledIds = new Set(
          conditions.filter((c) => c.settled).map((c) => c.id)
        );
        if (settledIds.size > 0) {
          setSelections((prev) =>
            prev.filter((s) => !settledIds.has(s.conditionId))
          );
        }
      })
      .catch(() => {
        // Silently ignore — selections will remain until next load
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPosition = useCallback(
    (position: Omit<CreatePositionEntry, 'id'>) => {
      // Dedup: treat same marketAddress as a single logical position
      const existingIndex = singlePositions.findIndex(
        (p) => p.marketAddress === position.marketAddress
      );

      if (existingIndex !== -1) {
        setSinglePositions((prev) =>
          prev.map((p, index) =>
            index === existingIndex
              ? {
                  ...p,
                  prediction: position.prediction,
                  marketId: position.marketId,
                  question: position.question,
                  positionSize: p.positionSize || DEFAULT_POSITION_SIZE,
                }
              : p
          )
        );
        setIsPopoverOpen(true);
        return;
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
                  positionSize: p.positionSize || DEFAULT_POSITION_SIZE,
                }
              : p
          )
        );
      } else {
        const id = `${position.marketAddress}-${position.marketId}-${position.prediction}-${Date.now()}`;
        const enhancedPosition: CreatePositionEntry = {
          ...position,
          id,
          positionSize: position.positionSize || DEFAULT_POSITION_SIZE,
          prediction: position.prediction ?? false,
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

  // Escrow helpers: convert selections to Pick[] array
  const getPolymarketPicks = useCallback((): EscrowPick[] => {
    return canonicalizePicks(
      selections
        .filter((s) => s.resolverAddress) // Only include selections with resolver address
        .map((s) => ({
          conditionResolver: s.resolverAddress as Address,
          conditionId: s.conditionId as Hex,
          predictedOutcome: s.prediction ? OutcomeSide.YES : OutcomeSide.NO,
        }))
    );
  }, [selections]);

  // Escrow helper: compute pickConfigId from current selections
  const getPickConfigId = useCallback((): Hex | null => {
    const picks = getPolymarketPicks();
    if (picks.length === 0) return null;
    return computePickConfigId(picks);
  }, [getPolymarketPicks]);

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
    getPolymarketPicks,
    getPickConfigId,
  };

  return (
    <CreatePositionContext.Provider value={value}>
      {children}
    </CreatePositionContext.Provider>
  );
};
