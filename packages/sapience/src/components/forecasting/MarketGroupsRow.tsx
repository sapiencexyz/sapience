'use client';

import Link from 'next/link';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@sapience/ui/components/ui/button';
import type { MarketWithContext } from './MarketGroupsList';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';

// Import the shared type

export interface MarketGroupsRowProps {
  chainId: number;
  marketAddress: string;
  market: MarketWithContext[];
  color: string;
  displayQuestion: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

const MarketGroupsRow = ({
  chainId,
  marketAddress,
  market,
  color,
  displayQuestion,
  isActive,
  marketClassification,
  displayUnit,
}: MarketGroupsRowProps) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { addPosition } = useBetSlipContext();

  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  // Helper function to format price as percentage
  const formatPriceAsPercentage = (price: number) => {
    if (price <= 0) return 'Price N/A';

    // Convert to percentage (price is typically between 0 and 1)
    const percentage = price * 100;
    return `${Math.round(percentage)}% chance`;
  };

  // Helper function to handle adding market to bet slip
  const handleAddToBetSlip = (marketItem: MarketWithContext) => {
    const position = {
      prediction: true, // Default to true, could be made dynamic based on market type
      marketAddress: marketAddress,
      marketId: marketItem.marketId,
      question: marketItem.question || marketItem.optionName || displayQuestion,
      chainId: chainId, // Include chainId so betslip knows which chain this market is on
    };
    addPosition(position);
  };

  if (!market || market.length === 0) {
    return null;
  }

  // Component to display market prediction with current price
  const MarketPrediction = () => {
    if (!isActive || market.length === 0) return null;

    if (
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
    ) {
      // For multichoice markets, find the option with the highest current price
      const marketPriceData = market.map((marketItem) => {
        const { data: currentPrice = 0 } = useMarketPrice(
          marketAddress,
          chainId,
          marketItem.marketId
        );
        return {
          marketItem,
          price: currentPrice,
        };
      });

      const highestPricedMarket = marketPriceData.reduce((highest, current) =>
        current.price > highest.price ? current : highest
      );

      if (highestPricedMarket.price > 0) {
        return (
          <span className="font-medium text-foreground">
            {highestPricedMarket.marketItem.optionName}
          </span>
        );
      }
      return <span className="font-medium text-foreground">Loading...</span>;
    } else {
      // For YES/NO and NUMERIC markets, get the appropriate market
      let targetMarket = market[0]; // Default to first market

      if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
        targetMarket = market.find((m) => m.optionName === 'Yes') || market[0];
      }

      const { data: currentPrice = 0 } = useMarketPrice(
        marketAddress,
        chainId,
        targetMarket.marketId
      );

      if (currentPrice > 0) {
        if (marketClassification === MarketGroupClassificationEnum.NUMERIC) {
          // For numeric markets, show the price with the display unit
          return (
            <span className="font-medium text-foreground">
              {currentPrice.toFixed(2)}
              {displayUnit && <span className="ml-1">{displayUnit}</span>}
            </span>
          );
        } else {
          // For YES/NO markets, show as percentage
          return (
            <span className="font-medium text-foreground">
              {formatPriceAsPercentage(currentPrice)}
            </span>
          );
        }
      }

      return <span className="font-medium text-foreground">Loading...</span>;
    }
  };

  // Component to display individual market prediction in the expanded panel
  const IndividualMarketPrediction = ({
    marketItem,
  }: {
    marketItem: MarketWithContext;
  }) => {
    const { data: currentPrice = 0 } = useMarketPrice(
      marketAddress,
      chainId,
      marketItem.marketId
    );

    if (currentPrice > 0) {
      return (
        <span className="font-medium text-foreground">
          {formatPriceAsPercentage(currentPrice)}
        </span>
      );
    }

    return <span className="font-medium text-foreground">Loading...</span>;
  };

  // Get the active market for action buttons (non-multichoice markets)
  const activeMarket = React.useMemo(() => {
    if (!isActive || market.length === 0) return null;

    // For YES_NO, prefer the "Yes" option, otherwise take the first market
    if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
      return market.find((m) => m.optionName === 'Yes') || market[0];
    }

    // For other non-multichoice types, take the first market
    return market[0];
  }, [isActive, market, marketClassification]);

  const canShowPredictionElement = isActive && market.length > 0;

  return (
    <div className="w-full">
      {/* Main Row Container for Color Bar + Content */}
      <div className="bg-background border-muted dark:bg-muted/50 flex flex-row transition-colors items-stretch min-h-[72px] relative">
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        {/* Content Container */}
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-5 py-4 md:py-3 gap-3">
          {/* Left Side: Question + Prediction */}
          <div className="flex-grow">
            <h3 className="text-xl font-heading font-normal mb-1">
              {displayQuestion}
            </h3>
            {/* Prediction Section (conditionally rendered) */}
            {canShowPredictionElement && (
              <div className="text-sm text-muted-foreground">
                <span className="text-muted-foreground">
                  Market Prediction:{' '}
                </span>
                <MarketPrediction />
              </div>
            )}
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex items-center gap-3 md:ml-6">
            {marketClassification ===
            MarketGroupClassificationEnum.MULTIPLE_CHOICE ? (
              // For multichoice markets, show Details + dropdown
              <>
                <Button
                  variant="link"
                  size="xs"
                  asChild
                  className="h-6 px-2 text-muted-foreground font-normal hover:text-foreground"
                >
                  <Link href={`/markets/${chainShortName}:${marketAddress}`}>
                    Details
                  </Link>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 px-3 w-[70px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                >
                  {isExpanded ? 'Hide' : 'Show'}
                </Button>
              </>
            ) : (
              // For non-multichoice markets, show Details + Wager buttons for the active market
              activeMarket && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="link"
                    size="xs"
                    asChild
                    className="h-6 px-2 text-muted-foreground font-normal hover:text-foreground"
                  >
                    <Link href={`/markets/${chainShortName}:${marketAddress}`}>
                      Details
                    </Link>
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleAddToBetSlip(activeMarket)}
                    className="h-8 px-3"
                  >
                    Wager
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Expanding Panel - Only for multichoice markets */}
      <AnimatePresence>
        {isExpanded &&
          marketClassification ===
            MarketGroupClassificationEnum.MULTIPLE_CHOICE && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden bg-background/95 border-l-4 border-muted"
              style={{ borderLeftColor: color }}
            >
              <div className="px-6">
                {/* Panel Content */}
                <div className="max-h-96 overflow-y-auto">
                  {market.length > 0 ? (
                    <div>
                      {market
                        .sort((a, b) => a.marketId - b.marketId)
                        .map((marketItem) => (
                          <div
                            key={marketItem.id}
                            className="flex items-center justify-between py-3 border-t border-border"
                          >
                            {/* Left Side: Option Name + Prediction */}
                            <div className="flex-grow">
                              <div className="font-medium text-foreground">
                                {marketItem.optionName ||
                                  `Market ${marketItem.marketId}`}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <span className="text-muted-foreground">
                                  Market Prediction:{' '}
                                </span>
                                <IndividualMarketPrediction
                                  marketItem={marketItem}
                                />
                              </div>
                            </div>

                            {/* Right Side: Actions */}
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="link"
                                  size="xs"
                                  asChild
                                  className="h-6 px-2 text-muted-foreground font-normal hover:text-foreground"
                                >
                                  <Link
                                    href={`/markets/${chainShortName}:${marketAddress}/${marketItem.marketId}`}
                                  >
                                    Details
                                  </Link>
                                </Button>

                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleAddToBetSlip(marketItem)}
                                  className="h-8 px-3"
                                >
                                  Wager
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No market data available
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};

export default MarketGroupsRow;
