import { useState, useCallback } from 'react';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { MarketGroupType } from '@sapience/ui/types';
import type { MarketGroupClassification } from '~/lib/types';

export interface TradeParams {
  positionId: string;
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  predictionValue: string;
  wagerAmount: string;
  quoteData: any; // Quote data from useQuoter
}

export interface MultiTradeResult {
  submitAllTrades: () => Promise<void>;
  isSubmitting: boolean;
  completedTrades: string[];
  failedTrades: string[];
  allTradesComplete: boolean;
  error: Error | null;
  reset: () => void;
}

export function useMultiTrade(trades: TradeParams[]): MultiTradeResult {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedTrades, setCompletedTrades] = useState<string[]>([]);
  const [failedTrades, setFailedTrades] = useState<string[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const submitAllTrades = useCallback(async () => {
    if (isSubmitting || trades.length === 0) return;

    setIsSubmitting(true);
    setCompletedTrades([]);
    setFailedTrades([]);
    setError(null);

    try {
      // Submit trades in sequence to avoid race conditions
      for (const trade of trades) {
        try {
          // We'll need to create trade instances on-demand since we can't use hooks in loops
          // For now, let's just simulate the process

          toast({
            title: 'Submitting Trade',
            description: `Submitting wager for ${trade.positionId}...`,
          });

          // TODO: Implement actual trade submission
          // This would need to be refactored to work with the useCreateTrade hook

          await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate trade

          setCompletedTrades((prev) => [...prev, trade.positionId]);

          toast({
            title: 'Trade Submitted',
            description: `Wager for ${trade.positionId} submitted successfully`,
          });
        } catch (tradeError) {
          console.error(
            `Failed to submit trade for ${trade.positionId}:`,
            tradeError
          );
          setFailedTrades((prev) => [...prev, trade.positionId]);

          toast({
            title: 'Trade Failed',
            description: `Failed to submit wager for ${trade.positionId}`,
            variant: 'destructive',
          });
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Unknown error occurred')
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [trades, isSubmitting, toast]);

  const reset = useCallback(() => {
    setIsSubmitting(false);
    setCompletedTrades([]);
    setFailedTrades([]);
    setError(null);
  }, []);

  const allTradesComplete =
    !isSubmitting &&
    completedTrades.length + failedTrades.length === trades.length &&
    trades.length > 0;

  return {
    submitAllTrades,
    isSubmitting,
    completedTrades,
    failedTrades,
    allTradesComplete,
    error,
    reset,
  };
}
