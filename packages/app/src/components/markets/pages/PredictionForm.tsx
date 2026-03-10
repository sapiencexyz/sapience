'use client';

import * as React from 'react';
import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@sapience/ui/components/ui/label';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatUnits } from 'viem';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import PercentChance from '~/components/shared/PercentChance';
import { useSingleConditionAuction } from '~/hooks/forms/useSingleConditionAuction';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

interface PredictionFormProps {
  /** The condition ID to predict on */
  conditionId: string;
  /** The full question text (used for tooltips and display when shortName not available) */
  question: string;
  /** Short display name (used in CreatePositionForm) */
  shortName?: string | null;
  /** Category slug for context */
  categorySlug?: string | null;
  /** Resolver address for canonical links */
  resolverAddress?: string | null;
  /** Chain ID for the prediction market */
  chainId: number;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** Bids from useAuctionStart */
  bids: QuoteBid[];
  /** Request quotes function from useAuctionStart */
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether the market is settled */
  settled?: boolean | null;
  /** The resolution outcome (true = YES, false = NO) */
  resolvedToYes?: boolean | null;
  /** Whether the resolution was non-decisive (tie) */
  nonDecisive?: boolean | null;
  /** End time of the market (Unix timestamp in seconds) */
  endTime?: number | null;
}

export default function PredictionForm({
  conditionId,
  question,
  shortName,
  categorySlug,
  resolverAddress,
  chainId,
  collateralDecimals = 18,
  bids,
  requestQuotes,
  className,
  settled,
  resolvedToYes,
  nonDecisive,
  endTime,
}: PredictionFormProps) {
  const [selectedPrediction] = React.useState<boolean | null>(true);
  const positionSize = '1'; // Fixed position size for forecast calculation
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
    positionSize,
    chainId,
    collateralDecimals,
    bids,
    requestQuotes,
    resolverAddress,
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
    if (
      !bestBid ||
      (bidPredictionRef.current !== null &&
        selectedPrediction !== bidPredictionRef.current)
    )
      return null;

    try {
      const counterpartyCollateralWei = BigInt(bestBid.counterpartyCollateral);
      const userPositionSizeNum = parseFloat(positionSize || '0');
      const counterpartyCollateralNum = Number(
        formatUnits(counterpartyCollateralWei, collateralDecimals)
      );
      const totalPayout = userPositionSizeNum + counterpartyCollateralNum;

      if (totalPayout <= 0) return null;

      const impliedProb = userPositionSizeNum / totalPayout;

      if (selectedPrediction === true) {
        return impliedProb;
      } else if (selectedPrediction === false) {
        return 1 - impliedProb;
      }

      return null;
    } catch {
      return null;
    }
  }, [bestBid, positionSize, collateralDecimals, selectedPrediction]);

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
      shortName,
      prediction: true,
      categorySlug: categorySlug ?? undefined,
      resolverAddress,
      endTime,
    });
    router.push('/markets');
  }, [
    conditionId,
    question,
    shortName,
    categorySlug,
    resolverAddress,
    endTime,
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
      shortName,
      prediction: false,
      categorySlug: categorySlug ?? undefined,
      resolverAddress,
      endTime,
    });
    router.push('/markets');
  }, [
    conditionId,
    question,
    shortName,
    categorySlug,
    resolverAddress,
    endTime,
    selections,
    removeSelection,
    addSelection,
    router,
  ]);

  // Handle request bids
  const handleRequestBids = useCallback(() => {
    triggerQuoteRequest({ forceRefresh: true });
  }, [triggerQuoteRequest]);

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Resolved or Resolution Pending Display */}
      {settled && (
        <div className="border border-border rounded-lg bg-brand-black p-4">
          <div className="flex items-center gap-2">
            <Label className="text-foreground font-normal text-lg -mt-0.5">
              Resolved
            </Label>
            <Badge
              variant="outline"
              className={`px-2 py-0.5 text-sm font-medium !rounded-md shrink-0 font-mono ${
                nonDecisive
                  ? 'border-muted-foreground/40 bg-muted/20 text-muted-foreground'
                  : resolvedToYes
                    ? 'border-yes/40 bg-yes/10 text-yes'
                    : 'border-no/40 bg-no/10 text-no'
              }`}
            >
              {nonDecisive ? 'INDECISIVE' : resolvedToYes ? 'YES' : 'NO'}
            </Badge>
          </div>
        </div>
      )}

      {/* Current Forecast */}
      {!settled && (
        <div className="border border-border rounded-lg bg-brand-black p-4">
          <div className="flex flex-col items-start gap-1">
            <Label className="text-foreground font-normal text-lg -mt-0.5">
              Current Forecast
            </Label>
            <span className="font-mono text-3xl">
              {currentForecast !== null ? (
                <PercentChance
                  probability={currentForecast}
                  showLabel
                  label="chance"
                  className="font-mono"
                  colorByProbability
                />
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
          </div>
        </div>
      )}

      {/* Make a Prediction - Show if not settled */}
      {!settled && (
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
