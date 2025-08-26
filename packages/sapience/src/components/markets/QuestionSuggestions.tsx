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
      // Sort markets by end timestamp (ascending - soonest ending first)
      const sortedByEndTime = [...markets].sort((a, b) => {
        const aEnd = a.endTimestamp || 0;
        const bEnd = b.endTimestamp || 0;
        return aEnd - bEnd;
      });

      // Take the next 12 markets that are ending
      const next12Ending = sortedByEndTime.slice(0, 12);

      // Initial client render: deterministic first 3 to avoid flicker in StrictMode
      let suggested = next12Ending.slice(0, 3);

      // Only randomize when the user explicitly refreshes
      if (refreshNonce > 0) {
        const shuffled = [...next12Ending].sort(() => Math.random() - 0.5);
        suggested = shuffled.slice(0, 3);
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
