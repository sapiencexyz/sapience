'use client';
import { type UseFormReturn, useWatch } from 'react-hook-form';
import { useEffect } from 'react';
import { Button } from '@/sapience/ui/index';
import Image from 'next/image';

import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import BetslipSinglesForm from './BetslipSinglesForm';
import BetslipParlayForm from './BetslipParlayForm';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';

interface BetslipContentProps {
  isParlayMode: boolean;
  individualMethods: UseFormReturn<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  parlayMethods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  handleIndividualSubmit: () => void;
  handleParlaySubmit: () => void;
  isParlaySubmitting: boolean;
  parlayError?: string | null;
  isSubmitting: boolean;
  // Optional minimum parlay wager (human units) to show and validate in the input
  minParlayWager?: string;
  parlayCollateralSymbol?: string;
  parlayCollateralAddress?: `0x${string}`;
  parlayChainId?: number;
  parlayCollateralDecimals?: number;
  // Auction integration (provided by parent to share a single WS connection)
  auctionId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (params: AuctionParams | null) => void;
}

export const BetslipContent = ({
  isParlayMode,
  individualMethods,
  parlayMethods,
  handleIndividualSubmit,
  handleParlaySubmit,
  isParlaySubmitting,
  parlayError,
  isSubmitting,
  minParlayWager,
  parlayCollateralSymbol,
  parlayCollateralAddress,
  parlayChainId,
  parlayCollateralDecimals,
  bids = [],
  requestQuotes,
}: BetslipContentProps) => {
  const isMobile = useIsMobile();
  const {
    betSlipPositions,
    clearBetSlip,
    parlaySelections,
    clearParlaySelections,
  } = useBetSlipContext();
  const effectiveParlayMode = isParlayMode;

  // Watch parlay form values to react to changes
  const parlayWagerAmount = useWatch({
    control: parlayMethods.control,
    name: 'wagerAmount',
  });

  const { address: makerAddress } = useAccount();

  // Trigger RFQ quote requests when selections or wager change
  useEffect(() => {
    if (!effectiveParlayMode) return;
    if (!requestQuotes) return;
    if (!makerAddress) return;
    if (!parlaySelections || parlaySelections.length === 0) return;
    const wagerStr = parlayWagerAmount || '0';
    try {
      const decimals = Number.isFinite(parlayCollateralDecimals as number)
        ? (parlayCollateralDecimals as number)
        : 18;
      const wagerWei = parseUnits(wagerStr, decimals).toString();

      const outcomes = parlaySelections.map((s) => ({
        // For RFQ conditions, encode id as marketId and leave address zeroed
        marketGroup: '0x0000000000000000000000000000000000000000',
        marketId: Number.parseInt(s.conditionId || '0', 10) || 0,
        prediction: !!s.prediction,
      }));

      const payload = buildAuctionStartPayload(outcomes);
      const params: AuctionParams = {
        wager: wagerWei,
        resolver: payload.resolver,
        predictedOutcomes: payload.predictedOutcomes,
        maker: makerAddress,
      };
      requestQuotes(params);
    } catch {
      // ignore formatting errors
    }
  }, [
    effectiveParlayMode,
    requestQuotes,
    parlaySelections,
    parlayWagerAmount,
    makerAddress,
    parlayCollateralDecimals,
  ]);

  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div
          className={`relative px-4 pt-1.5 pb-1.5 bg-muted/50 border-b border-border/40 ${isMobile ? 'border-t' : ''}`}
        >
          <div className="grid grid-cols-[auto_1fr_auto] items-center h-10">
            <span className="text-lg font-medium">Make a Prediction</span>
            <div className="col-start-3 justify-self-end">
              {(effectiveParlayMode
                ? parlaySelections.length > 0
                : betSlipPositions.length > 0) && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={
                    effectiveParlayMode ? clearParlaySelections : clearBetSlip
                  }
                  title="Reset"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 ${
            betSlipPositions.length === 0 ? '' : 'overflow-y-auto'
          }`}
        >
          {(
            effectiveParlayMode
              ? parlaySelections.length === 0
              : betSlipPositions.length === 0
          ) ? (
            <div className="w-full h-full flex items-center justify-center text-center">
              <div className="flex flex-col items-center gap-4">
                <Image src="/usde.svg" alt="USDe" width={42} height={42} />
                <p className="text-base text-muted-foreground max-w-[180px] mx-auto">
                  {'Add predictions to see your potential winnings'}
                </p>
              </div>
            </div>
          ) : !effectiveParlayMode ? (
            <BetslipSinglesForm
              methods={individualMethods}
              onSubmit={handleIndividualSubmit}
              isSubmitting={isSubmitting}
            />
          ) : (
            <BetslipParlayForm
              methods={parlayMethods}
              onSubmit={handleParlaySubmit}
              isSubmitting={isParlaySubmitting}
              error={parlayError}
              minWager={minParlayWager}
              collateralSymbol={parlayCollateralSymbol}
              collateralAddress={parlayCollateralAddress}
              chainId={parlayChainId}
              collateralDecimals={parlayCollateralDecimals}
              bids={bids}
            />
          )}
        </div>
        {/* Footer actions removed as Clear all is now in the header */}
      </div>
    </>
  );
};
