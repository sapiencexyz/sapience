import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';

import { MarketGroupClassification } from '~/lib/types';

const SHARED_MARGIN_LEFT_CLASS = 'ml-1';
const LONG_BADGE_CLASS = 'border-green-500/40 bg-green-500/10 text-green-600';
const SHORT_BADGE_CLASS = 'border-red-500/40 bg-red-500/10 text-red-600';

interface TradeOrderQuoteProps {
  marketClassification: MarketGroupClassification;
  baseTokenName?: string;
  quoteTokenName?: string;
  collateralAssetTicker?: string;
  direction: 'Long' | 'Short';
  priceImpact: number;
  showPriceImpactWarning: boolean;
  walletBalance?: string;
  estimatedResultingBalance?: string;
  isLoading: boolean;
  showQuote: boolean; // Combined visibility control

  // Create form specific
  sizeInput?: string; // Target size input for create
  estimatedCollateral?: string; // For create
  estimatedFillPrice?: string; // For create
  estimatedCollateralBI?: bigint; // For create
  quotedFillPriceBI_create?: bigint; // For create (renamed to avoid clash)

  // Modify form specific
  originalSizeFormatted?: string; // For modify
  targetSizeFormatted?: string; // For modify
  originalPositionDirection?: 'Long' | 'Short'; // For modify
  sizeChangeBigInt?: bigint; // For modify
  currentPositionCollateral?: string; // For modify (formatted)
  resultingPositionCollateral?: string; // For modify
  quotedFillPrice_modify?: string; // For modify (renamed)
  quotedFillPriceBI_modify?: bigint; // For modify (renamed)
  isClosing?: boolean; // For modify, to hide fill price when closing

  formType: 'create' | 'modify';
}

const TradeOrderQuote: React.FC<TradeOrderQuoteProps> = ({
  marketClassification,
  baseTokenName,
  quoteTokenName,
  collateralAssetTicker,
  direction,
  priceImpact,
  showPriceImpactWarning,
  walletBalance,
  estimatedResultingBalance,
  isLoading,
  showQuote,
  // Create
  sizeInput,
  estimatedCollateral,
  estimatedFillPrice,
  estimatedCollateralBI,
  quotedFillPriceBI_create,
  // Modify
  originalSizeFormatted,
  targetSizeFormatted,
  originalPositionDirection,
  sizeChangeBigInt,
  currentPositionCollateral,
  resultingPositionCollateral,
  quotedFillPrice_modify,
  quotedFillPriceBI_modify,
  isClosing,
  formType,
}) => {
  const displaySize =
    formType === 'create' ? sizeInput || '0' : targetSizeFormatted || '0';
  const displayFillPrice =
    formType === 'create' ? estimatedFillPrice : quotedFillPrice_modify;
  const displayQuotedFillPriceBI =
    formType === 'create' ? quotedFillPriceBI_create : quotedFillPriceBI_modify;

  const renderSizeDisplay = () => {
    if (formType === 'create') {
      return (
        <>
          {marketClassification === MarketGroupClassification.NUMERIC && (
            <Badge
              variant="outline"
              className={`mr-2 px-1.5 py-0.5 text-xs font-medium ${
                direction === 'Long' ? LONG_BADGE_CLASS : SHORT_BADGE_CLASS
              }`}
            >
              {direction}
            </Badge>
          )}
          <NumberDisplay value={displaySize} />{' '}
          {marketClassification === MarketGroupClassification.NUMERIC ? (
            <span className={SHARED_MARGIN_LEFT_CLASS}>{baseTokenName}</span>
          ) : (
            <span className={SHARED_MARGIN_LEFT_CLASS}>
              {direction === 'Long' ? 'Yes' : 'No'}
            </span>
          )}
        </>
      );
    }
    // Modify form
    return (
      <>
        {/* Original Size and Direction */}
        {marketClassification === MarketGroupClassification.NUMERIC &&
          originalPositionDirection && (
            <Badge
              variant="outline"
              className={`px-1.5 py-0.5 text-xs font-medium ${
                originalPositionDirection === 'Long'
                  ? LONG_BADGE_CLASS
                  : SHORT_BADGE_CLASS
              }`}
            >
              {originalPositionDirection}
            </Badge>
          )}
        <NumberDisplay value={originalSizeFormatted || '0'} />
        <span className={SHARED_MARGIN_LEFT_CLASS}>{baseTokenName}</span>
        <span className="mx-1">→</span>
        {/* Target Size and Direction */}
        {marketClassification === MarketGroupClassification.NUMERIC &&
          sizeChangeBigInt !== BigInt(0) && (
            <Badge
              variant="outline"
              className={`px-1.5 py-0.5 text-xs font-medium ${
                direction === 'Long' ? LONG_BADGE_CLASS : SHORT_BADGE_CLASS
              }`}
            >
              {direction}
            </Badge>
          )}
        <NumberDisplay value={targetSizeFormatted || '0'} />
        {marketClassification === MarketGroupClassification.NUMERIC ? (
          <span className={SHARED_MARGIN_LEFT_CLASS}>{baseTokenName}</span>
        ) : (
          <span className={SHARED_MARGIN_LEFT_CLASS}>
            {direction === 'Long' ? 'Yes' : 'No'}
          </span>
        )}
      </>
    );
  };

  const renderCollateralDisplay = () => {
    if (formType === 'create') {
      return (
        estimatedCollateralBI &&
        estimatedCollateralBI > BigInt(0) && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Position Collateral</span>
            <span>
              0 → <NumberDisplay value={estimatedCollateral || '0'} />{' '}
              {collateralAssetTicker}
            </span>
          </div>
        )
      );
    }
    // Modify form
    return (
      <div className="flex justify-between">
        <span className="text-muted-foreground">Position Collateral</span>
        <span>
          <NumberDisplay value={currentPositionCollateral || '0'} /> →{' '}
          <NumberDisplay value={resultingPositionCollateral || '0'} />{' '}
          {collateralAssetTicker}
        </span>
      </div>
    );
  };

  const shouldShowFillPrice =
    formType === 'create'
      ? displayQuotedFillPriceBI && displayQuotedFillPriceBI > BigInt(0)
      : displayQuotedFillPriceBI &&
        displayQuotedFillPriceBI > BigInt(0) &&
        !isClosing;

  return (
    <AnimatePresence mode="wait">
      {showQuote && (
        <motion.div
          key={
            formType === 'create'
              ? 'details-container-create'
              : 'details-container-modify'
          }
          layout
          initial={{ opacity: 0, height: 0, transformOrigin: 'top' }}
          animate={{ opacity: 1, height: 'auto', transformOrigin: 'top' }}
          exit={{ opacity: 0, height: 0, transformOrigin: 'top' }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="mb-6 relative overflow-hidden"
        >
          <div
            className={`transition-opacity duration-150 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
          >
            <h4 className="text-sm font-medium mb-2.5 flex items-center">
              Order Quote
            </h4>
            <div className="flex flex-col gap-2.5 text-sm">
              {/* Size Change */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size</span>
                <span className="flex items-center space-x-1">
                  {renderSizeDisplay()}
                </span>
              </div>

              {/* Collateral Change */}
              {renderCollateralDisplay()}

              {/* Estimated Fill Price */}
              {shouldShowFillPrice && (
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">
                    Estimated Fill Price
                  </span>
                  <span className="flex items-baseline">
                    <span>
                      <NumberDisplay value={displayFillPrice || '0'} />{' '}
                      {quoteTokenName}
                    </span>
                    {priceImpact > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`ml-2 text-xs cursor-help ${
                                showPriceImpactWarning
                                  ? 'text-red-500'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {Number(priceImpact.toFixed(2)).toString()}%
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>
                              This is the impact your order will make on the
                              current market price.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
                </div>
              )}

              {/* Wallet Balance Change */}
              {walletBalance !== undefined &&
                estimatedResultingBalance !== undefined && ( // Ensure both are defined
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Wallet Balance
                    </span>
                    <span>
                      <NumberDisplay value={walletBalance || '0'} /> →{' '}
                      <NumberDisplay value={estimatedResultingBalance || '0'} />{' '}
                      {collateralAssetTicker}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TradeOrderQuote;
