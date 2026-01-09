'use client';

import * as React from 'react';
import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@sapience/ui/components/ui/label';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatUnits } from 'viem';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useSingleConditionAuction } from '~/hooks/forms/useSingleConditionAuction';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

interface PredictionFormProps {
  /** The condition ID to bet on */
  conditionId: string;
  /** The question text for context */
  question: string;
  /** Category slug for context */
  categorySlug?: string | null;
  /** Chain ID for the prediction market */
  chainId: number;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** PredictionMarket contract address */
  predictionMarketAddress?: `0x${string}`;
  /** Bids from useAuctionStart */
  bids: QuoteBid[];
  /** Request quotes function from useAuctionStart */
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean; requireSignature?: boolean }
  ) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether the market is settled */
  settled?: boolean | null;
  /** The resolution outcome (true = YES, false = NO) */
  resolvedToYes?: boolean | null;
  /** End time of the market (Unix timestamp in seconds) */
  endTime?: number | null;
}

export default function PredictionForm({
  conditionId,
  question,
  categorySlug,
  chainId,
  collateralDecimals = 18,
  predictionMarketAddress,
  bids,
  requestQuotes,
  className,
  settled,
  resolvedToYes,
  endTime,
}: PredictionFormProps) {
  const [selectedPrediction] = React.useState<boolean | null>(true);
  const wagerAmount = '1'; // Fixed wager for forecast calculation
  const router = useRouter();
  const { addSelection, removeSelection, selections } =
    useCreatePositionContext();

  // Use the shared auction hook for quote management
  const {
    bestBid,
    triggerQuoteRequest,
    isWaitingForBids,
    showRequestBidsButton,
  } = useSingleConditionAuction({
    conditionId: selectedPrediction !== null ? conditionId : null,
    prediction: selectedPrediction,
    wagerAmount,
    chainId,
    collateralDecimals,
    predictionMarketAddress,
    bids,
    requestQuotes,
  });

  // Track which prediction direction the current bestBid corresponds to
  // This prevents showing stale forecast when switching Yes/No
  const bidPredictionRef = useRef<boolean | null>(null);

  // Update ref ONLY when bestBid changes - this records which prediction the bid was for
  useEffect(() => {
    if (bestBid) {
      bidPredictionRef.current = selectedPrediction;
    }
  }, [bestBid, selectedPrediction]);

  // Derive current forecast from best bid odds
  // Always shows probability of Yes resolution
  const currentForecast = useMemo(() => {
    // Don't show forecast if bid is stale (from different prediction direction)
    if (
      !bestBid ||
      (bidPredictionRef.current !== null &&
        selectedPrediction !== bidPredictionRef.current)
    )
      return null;

    try {
      const makerWagerWei = BigInt(bestBid.makerWager);
      const userWagerNum = parseFloat(wagerAmount || '0');
      const makerWagerNum = Number(
        formatUnits(makerWagerWei, collateralDecimals)
      );
      const totalPayout = userWagerNum + makerWagerNum;

      if (totalPayout <= 0) return null;

      const impliedProb = userWagerNum / totalPayout;

      if (selectedPrediction === true) {
        return Math.round(impliedProb * 100);
      } else if (selectedPrediction === false) {
        return Math.round((1 - impliedProb) * 100);
      }

      return null;
    } catch {
      return null;
    }
  }, [bestBid, wagerAmount, collateralDecimals, selectedPrediction]);

  // Get current selection state for this condition
  const selectionState = React.useMemo(() => {
    const existing = selections.find((s) => s.conditionId === conditionId);
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [selections, conditionId]);

  // Handle Yes/No selection - same behavior as ticker
  const handleYes = useCallback(() => {
    const existing = selections.find((s) => s.conditionId === conditionId);
    if (existing && existing.prediction === true) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId,
      question,
      prediction: true,
      categorySlug: categorySlug ?? undefined,
    });
    router.push('/markets');
  }, [
    conditionId,
    question,
    categorySlug,
    selections,
    removeSelection,
    addSelection,
    router,
  ]);

  const handleNo = useCallback(() => {
    const existing = selections.find((s) => s.conditionId === conditionId);
    if (existing && existing.prediction === false) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId,
      question,
      prediction: false,
      categorySlug: categorySlug ?? undefined,
    });
    router.push('/markets');
  }, [
    conditionId,
    question,
    categorySlug,
    selections,
    removeSelection,
    addSelection,
    router,
  ]);

  // Handle request bids
  const handleRequestBids = useCallback(() => {
    triggerQuoteRequest({ forceRefresh: true, requireSignature: false });
  }, [triggerQuoteRequest]);

  // Check if we're past the end time
  const isPastEndTime = React.useMemo(() => {
    if (!endTime) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return endTime <= nowSec;
  }, [endTime]);

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Current Forecast, Resolved, or Pending Display */}
      <div className="border border-border rounded-lg bg-brand-black p-4">
        <div className="flex flex-col items-start gap-1">
          {settled || isPastEndTime ? (
            <div className="flex items-center gap-2">
              <Label className="text-foreground font-normal text-lg -mt-0.5">
                {settled ? 'Resolved' : 'Resolution Pending'}
              </Label>
              {settled ? (
                <Badge
                  variant="outline"
                  className={`px-2 py-0.5 text-sm font-medium !rounded-md shrink-0 font-mono ${
                    resolvedToYes
                      ? 'border-yes/40 bg-yes/10 text-yes'
                      : 'border-no/40 bg-no/10 text-no'
                  }`}
                >
                  {resolvedToYes ? 'YES' : 'NO'}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 text-sm font-medium !rounded-md shrink-0 font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
                >
                  PENDING
                </Badge>
              )}
            </div>
          ) : (
            <>
              <Label className="text-foreground font-normal text-lg -mt-0.5">
                Current Forecast
              </Label>
              <span className="font-mono text-ethena text-3xl">
                {currentForecast !== null ? (
                  `${currentForecast}% chance`
                ) : isWaitingForBids ? (
                  <span className="text-muted-foreground/60 animate-pulse">
                    Requesting...
                  </span>
                ) : showRequestBidsButton ? (
                  <button
                    type="button"
                    onClick={handleRequestBids}
                    className="text-brand-white border-b border-dotted border-brand-white/50 hover:border-brand-white transition-colors"
                  >
                    Request
                  </button>
                ) : (
                  '\u00A0'
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Make a Prediction - Only show if not past end time */}
      {!isPastEndTime && (
        <div className="border border-border rounded-lg bg-brand-black p-4 pb-5">
          <div className="flex flex-col items-start gap-1">
            <Label className="text-foreground font-normal text-lg -mt-0.5">
              Make a Prediction
            </Label>
            <div className="font-mono w-full mt-1.5">
              <YesNoSplitButton
                onYes={handleYes}
                onNo={handleNo}
                selectedYes={selectionState.selectedYes}
                selectedNo={selectionState.selectedNo}
                size="lg"
                yesLabel="PREDICT YES"
                noLabel="PREDICT NO"
                labelClassName="text-sm tracking-wider"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
