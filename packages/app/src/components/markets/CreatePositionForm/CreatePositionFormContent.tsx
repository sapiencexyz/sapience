'use client';
import { type UseFormReturn } from 'react-hook-form';
import { Button, type PythPrediction } from '@sapience/ui';
import { Share2, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sapience/ui/components/ui/dropdown-menu';
import { ImageIcon, Link2 } from 'lucide-react';

import PositionForm from './PositionForm';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';

interface CreatePositionFormContentProps {
  formMethods: UseFormReturn<{
    positionSize: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; positionSize: string; isFlipped?: boolean }
    >;
  }>;
  /** Submit handler - receives the exact bid being submitted */
  handlePositionSubmit: (bid: QuoteBid) => void;
  isPositionSubmitting: boolean;
  positionError?: string | null;
  positionChainId?: number;
  bids?: QuoteBid[];
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minPositionSize?: string;
  predictionMarketAddress?: `0x${string}`;
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
  onClearPythPredictions?: () => void;
  onViewCard?: () => void;
  onCopyLink?: () => void;
}

export function CreatePositionFormContent({
  formMethods,
  handlePositionSubmit,
  isPositionSubmitting,
  positionError,
  positionChainId,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minPositionSize,
  predictionMarketAddress,
  pythPredictions = [],
  onRemovePythPrediction,
  onClearPythPredictions,
  onViewCard,
  onCopyLink,
}: CreatePositionFormContentProps): React.ReactElement {
  const { selections, clearSelections } = useCreatePositionContext();
  const hasItems = selections.length > 0 || pythPredictions.length > 0;

  const handleClear = () => {
    clearSelections();
    onClearPythPredictions?.();
  };

  return (
    <div className="w-full h-full flex flex-col">
      {hasItems && (
        <div className="relative px-4 pt-2 pb-2 lg:hidden">
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-foreground font-sans">
              Take a Position
            </h3>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 flex items-center gap-1"
                  >
                    <Share2 className="h-2 w-2" />
                    SHARE
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="group cursor-pointer flex items-center gap-2"
                    onClick={onViewCard}
                  >
                    <ImageIcon className="h-4 w-4 opacity-75 group-hover:opacity-100" />
                    <span>View Card</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="group cursor-pointer flex items-center gap-2"
                    onClick={onCopyLink}
                  >
                    <Link2 className="h-4 w-4 opacity-75 group-hover:opacity-100" />
                    <span>Copy Link</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="xs"
                className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 flex items-center gap-1"
                onClick={handleClear}
                title="Reset"
              >
                <X className="h-3.5 w-3.5" />
                CLEAR
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex-1 min-h-0 ${hasItems ? 'overflow-y-auto pb-4' : ''}`}
      >
        {!hasItems ? (
          <div className="w-full h-full flex items-center justify-center text-center">
            <div className="flex flex-col items-center gap-2 py-20">
              <p className="text-sm font-mono uppercase text-accent-gold max-w-[220px] mx-auto bg-transparent tracking-wide">
                ADD PREDICTIONS TO SEE YOUR POTENTIAL PAYOUT
              </p>
            </div>
          </div>
        ) : (
          <PositionForm
            methods={formMethods}
            onSubmit={handlePositionSubmit}
            isSubmitting={isPositionSubmitting}
            error={positionError}
            chainId={positionChainId}
            bids={bids}
            requestQuotes={requestQuotes}
            collateralToken={collateralToken}
            collateralSymbol={collateralSymbol}
            collateralDecimals={collateralDecimals}
            minPositionSize={minPositionSize}
            predictionMarketAddress={predictionMarketAddress}
            pythPredictions={pythPredictions}
            onRemovePythPrediction={onRemovePythPrediction}
          />
        )}
      </div>
    </div>
  );
}
