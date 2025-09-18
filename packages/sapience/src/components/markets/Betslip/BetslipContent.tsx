'use client';
import { type UseFormReturn } from 'react-hook-form';
import { Button } from '@/sapience/ui/index';
import Image from 'next/image';

import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import BetslipSinglesForm from './BetslipSinglesForm';
import BetslipParlayForm from './BetslipParlayForm';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

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
  parlayChainId?: number;
  // Auction integration (provided by parent to share a single WS connection)
  auctionId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (params: AuctionParams | null) => void;
  // Collateral configuration from useSubmitParlay hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
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
  parlayChainId,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minWager,
}: BetslipContentProps) => {
  const isMobile = useIsMobile();
  const {
    betSlipPositions,
    clearBetSlip,
    parlaySelections,
    clearParlaySelections,
  } = useBetSlipContext();
  const effectiveParlayMode = isParlayMode;

  // Note: RFQ quote request logic is now handled inside BetslipParlayForm
  // This was moved to reduce prop drilling and keep related logic together

  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div
          className={`relative px-4 ${isMobile ? '' : 'pt-1.5 pb-1.5 bg-muted/50 border-b border-border/40'}`}
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
              chainId={parlayChainId}
              bids={bids}
              requestQuotes={requestQuotes}
              collateralToken={collateralToken}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              minWager={minWager}
            />
          )}
        </div>
        {/* Footer actions removed as Clear all is now in the header */}
      </div>
    </>
  );
};
