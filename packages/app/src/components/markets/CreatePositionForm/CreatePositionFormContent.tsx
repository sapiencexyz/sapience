'use client';
import { type UseFormReturn } from 'react-hook-form';
import { Button, type PythPrediction } from '@sapience/ui';

import PositionForm from './PositionForm';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface CreatePositionFormContentProps {
  isPositionMode: boolean;
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
  handlePositionSubmit: () => void;
  isPositionSubmitting: boolean;
  positionError?: string | null;
  isSubmitting: boolean;
  parlayChainId?: number;
  // Auction integration (provided by parent to share a single WS connection)
  auctionId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  // Collateral configuration from useSubmitPosition hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
  // PredictionMarket contract address for fetching maker nonce
  predictionMarketAddress?: `0x${string}`;
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
  onClearPythPredictions?: () => void;
}

export const CreatePositionFormContent = ({
  parlayMethods,
  handlePositionSubmit,
  isPositionSubmitting,
  positionError,
  parlayChainId,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minWager,
  predictionMarketAddress,
  pythPredictions = [],
  onRemovePythPrediction,
  onClearPythPredictions,
}: CreatePositionFormContentProps) => {
  const { selections, clearSelections } = useCreatePositionContext();
  const hasItems = selections.length > 0 || pythPredictions.length > 0;

  return (
    <>
      <div className="w-full h-full flex flex-col">
        {hasItems && (
          <div className="relative px-4 pt-2 pb-2 lg:hidden">
            <div className="flex items-center justify-between">
              <h3 className="eyebrow text-foreground font-sans">
                Take a Position
              </h3>
              <Button
                variant="ghost"
                size="xs"
                className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 relative -top-0.5"
                onClick={() => {
                  clearSelections();
                  onClearPythPredictions?.();
                }}
                title="Reset"
              >
                CLEAR
              </Button>
            </div>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 ${hasItems ? 'overflow-y-auto pb-4' : ''}`}
        >
          {selections.length === 0 && pythPredictions.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-center">
              <div className="flex flex-col items-center gap-2 py-20">
                <p className="text-sm font-mono uppercase text-accent-gold max-w-[260px] mx-auto bg-transparent tracking-wide">
                  ADD PREDICTIONS TO SEE POTENTIAL WINNINGS
                </p>
              </div>
            </div>
          ) : (
            <PositionForm
              methods={parlayMethods}
              onSubmit={handlePositionSubmit}
              isSubmitting={isPositionSubmitting}
              error={positionError}
              chainId={parlayChainId}
              bids={bids}
              requestQuotes={requestQuotes}
              collateralToken={collateralToken}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              minWager={minWager}
              predictionMarketAddress={predictionMarketAddress}
              pythPredictions={pythPredictions}
              onRemovePythPrediction={onRemovePythPrediction}
            />
          )}
        </div>
      </div>
    </>
  );
};
