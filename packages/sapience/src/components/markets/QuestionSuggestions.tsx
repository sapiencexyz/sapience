'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import QuestionItem from '../shared/QuestionItem';

interface QuestionSuggestionsProps {
  markets: any[];
  onMarketSelect: (market: any) => void;
}

const QuestionSuggestions = ({
  markets,
  onMarketSelect,
}: QuestionSuggestionsProps) => {
  const suggestionsRef = useRef<any[]>([]);
  const marketsRef = useRef<any[]>([]);
  const isInitializedRef = useRef(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure no SSR render: only show suggestions after the component mounts
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check if markets have actually changed (not just reference)
  const marketsChanged = useMemo(() => {
    if (!isInitializedRef.current) {
      return true;
    }

    if (marketsRef.current.length !== markets.length) {
      return true;
    }

    // Compare market IDs to see if the actual markets changed
    const currentIds = markets.map((m) => m.id).sort();
    const previousIds = marketsRef.current.map((m) => m.id).sort();

    return JSON.stringify(currentIds) !== JSON.stringify(previousIds);
  }, [markets]);

  // Generate suggestions synchronously on first render and when markets change
  const suggestedMarkets = useMemo(() => {
    // During SSR and the very first client render, render nothing to avoid hydration mismatches
    if (!isMounted) return [];

    // Recompute when markets change, on first init, or when user requests refresh
    if (marketsChanged || !isInitializedRef.current || refreshNonce > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      // Filter to only future-ending markets
      const futureMarkets = markets.filter((m) => {
        const end = typeof m?.endTimestamp === 'number' ? m.endTimestamp : 0;
        return end > nowSeconds;
      });

      const pool = futureMarkets.slice(0, 1000); // cap to avoid huge arrays

      // Helpers
      const shuffle = (arr: any[]) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const pickRandom = <T,>(arr: T[]): T | null => {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
      };

      // Build a map of category -> markets
      const categoryToMarkets: Record<string, any[]> = {};
      for (const m of pool) {
        const categoryKey =
          m?.group?.category?.slug ?? m?.group?.category?.id ?? 'unknown';
        if (!categoryToMarkets[categoryKey]) {
          categoryToMarkets[categoryKey] = [];
        }
        categoryToMarkets[categoryKey].push(m);
      }

      const categoryKeys = Object.keys(categoryToMarkets);
      const suggested: any[] = [];

      if (categoryKeys.length >= 3) {
        // Pick three distinct categories at random
        const chosenCategories = shuffle(categoryKeys).slice(0, 3);
        for (const key of chosenCategories) {
          const pick = pickRandom(categoryToMarkets[key]);
          if (pick) suggested.push(pick);
        }
      } else {
        // Fewer than three categories available: pick one per category first
        for (const key of categoryKeys) {
          const pick = pickRandom(categoryToMarkets[key]);
          if (pick) suggested.push(pick);
        }
        // Fill remaining slots from remaining pool (avoiding duplicates) up to 3
        if (suggested.length < 3) {
          const remaining = pool.filter(
            (m) => !suggested.some((s) => s.id === m.id)
          );
          const shuffledRemaining = shuffle(remaining);
          for (const m of shuffledRemaining) {
            if (suggested.length >= 3) break;
            suggested.push(m);
          }
        }
      }

      suggestionsRef.current = suggested;
      marketsRef.current = markets;
      isInitializedRef.current = true;

      return suggested;
    }

    return suggestionsRef.current;
  }, [markets, marketsChanged, refreshNonce, isMounted]);

  if (!isMounted || suggestedMarkets.length === 0) {
    return null;
  }

  return (
    <div className="p-6 gap-1.5 flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-muted-foreground">
          Make a Prediction
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setRefreshNonce((n) => n + 1)}
                aria-label="Randomize suggested questions"
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Randomize suggested questions</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
        <div>
          {suggestedMarkets.map((market, index) => (
            <QuestionItem
              key={market.id}
              item={market}
              onClick={onMarketSelect}
              showBorder={index < suggestedMarkets.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuestionSuggestions;
