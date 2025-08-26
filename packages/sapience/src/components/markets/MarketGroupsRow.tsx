'use client';

import Link from 'next/link';
import Image from 'next/image';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

import { Button } from '@sapience/ui/components/ui/button';
import type { MarketWithContext } from './MarketGroupsList';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import { DEFAULT_WAGER_AMOUNT } from '~/lib/utils/betslipUtils';

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

  // Ensure markets are in ascending order by marketId everywhere in this component
  const sortedMarkets = React.useMemo(
    () => [...market].sort((a, b) => a.marketId - b.marketId),
    [market]
  );

  // Extract market IDs from the market array
  const marketIds = React.useMemo(
    () => sortedMarkets.map((m) => m.marketId),
    [sortedMarkets]
  );

  // Use the chart data hook to get latest prices
  const { chartData, isLoading: isLoadingChartData } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
  });

  // Get the latest price data from chart data
  const latestPrices = React.useMemo(() => {
    if (chartData.length === 0) return {};

    const latestDataPoint = chartData[chartData.length - 1];
    const prices: Record<number, number> = {};

    if (latestDataPoint.markets) {
      Object.entries(latestDataPoint.markets).forEach(
        ([marketIdStr, value]) => {
          if (typeof value === 'number') {
            // Scale down from Wei (divide by 1e18) to get decimal value between 0-1
            prices[parseInt(marketIdStr)] = value / 1e18;
          }
        }
      );
    }

    return prices;
  }, [chartData]);

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
      prediction: true, // Default to true, will be overridden by smart defaults for YES_NO markets
      marketAddress: marketAddress,
      marketId: marketItem.marketId,
      question: marketItem.question || marketItem.optionName || displayQuestion,
      chainId: chainId, // Include chainId so betslip knows which chain this market is on
      marketClassification, // Pass classification for intelligent defaults
      wagerAmount: DEFAULT_WAGER_AMOUNT,
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
        const currentPrice = latestPrices[marketItem.marketId] || 0;
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
      return (
        <span className="text-foreground">
          {isLoadingChartData ? 'Loading...' : <span>No trades yet</span>}
        </span>
      );
    } else {
      // For YES/NO and NUMERIC markets, get the appropriate market
      let targetMarket = market[0]; // Default to first market

      if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
        targetMarket = market.find((m) => m.optionName === 'Yes') || market[0];
      }

      const currentPrice = latestPrices[targetMarket.marketId] || 0;

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

      return (
        <span className="text-foreground">
          {isLoadingChartData ? 'Loading...' : 'No trades yet'}
        </span>
      );
    }
  };

  // Component to display individual market prediction in the expanded panel
  const IndividualMarketPrediction = ({
    marketItem,
  }: {
    marketItem: MarketWithContext;
  }) => {
    const currentPrice = latestPrices[marketItem.marketId] || 0;

    if (currentPrice > 0) {
      return (
        <span className="font-medium text-foreground">
          {formatPriceAsPercentage(currentPrice)}
        </span>
      );
    }

    return (
      <span className="text-foreground">
        {isLoadingChartData ? (
          <span>Loading...</span>
        ) : (
          <span>No trades yet</span>
        )}
      </span>
    );
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
      <div className="bg-background border-muted dark:bg-muted/50 flex flex-row transition-colors items-stretch min-h-[88px] md:min-h-[72px] relative">
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        {/* Content Container */}
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-5 py-4 md:py-3 gap-3">
          {/* Left Side: Question + Prediction */}
          <div className="flex-grow">
            <h3 className="text-xl mb-1.5">
              <Link
                href={`/markets/${chainShortName}:${marketAddress}`}
                className="group"
              >
                <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                  {displayQuestion}
                </span>
              </Link>
            </h3>
            {/* Prediction Section (conditionally rendered) */}
            {canShowPredictionElement && (
              <div className="text-sm text-muted-foreground">
                <span className="text-muted-foreground">
                  Market Prediction:{' '}
                </span>
                <MarketPrediction />
                {marketClassification !==
                  MarketGroupClassificationEnum.MULTIPLE_CHOICE &&
                  activeMarket && (
                    <Button
                      variant="link"
                      size="xs"
                      asChild
                      className="h-6 px-0 ml-6 inline-flex items-center text-sm font-normal text-muted-foreground hover:text-foreground"
                    >
                      <Link
                        href={`/markets/${chainShortName}:${marketAddress}/${activeMarket.marketId}`}
                        className="group inline-flex items-center"
                      >
                        <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                          Details
                        </span>
                      </Link>
                    </Button>
                  )}
              </div>
            )}
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex flex-row-reverse items-center gap-3 self-start md:flex-row md:ml-6 md:self-auto">
            {marketClassification ===
            MarketGroupClassificationEnum.MULTIPLE_CHOICE ? (
              // For multichoice markets, show only the dropdown toggle
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-28 text-base"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                >
                  <span className="flex items-center gap-1">
                    {isExpanded ? 'Hide' : 'Show'}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </span>
                </Button>
              </>
            ) : (
              // For non-multichoice markets, show Wager button for the active market
              activeMarket && (
                <>
                  <Button
                    variant="default"
                    size="lg"
                    onClick={() => handleAddToBetSlip(activeMarket)}
                    className="w-28 text-base"
                  >
                    <Image
                      src="/susde-icon.svg"
                      alt="sUSDe"
                      width={20}
                      height={20}
                    />
                    Predict
                  </Button>
                </>
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
              <div className="px-6  dark:bg-muted/50">
                {/* Panel Content */}
                <div className="max-h-96 overflow-y-auto">
                  {sortedMarkets.length > 0 ? (
                    <div>
                      {sortedMarkets.map((marketItem) => (
                        <div
                          key={marketItem.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between py-3 border-t border-border gap-3"
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
                              <Button
                                variant="link"
                                size="xs"
                                asChild
                                className="h-6 px-0 ml-4 inline-flex items-center text-sm font-normal text-muted-foreground hover:text-foreground"
                              >
                                <Link
                                  href={`/markets/${chainShortName}:${marketAddress}/${marketItem.marketId}`}
                                  className="group inline-flex items-center"
                                >
                                  <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                                    Details
                                  </span>
                                </Link>
                              </Button>
                            </div>
                          </div>

                          {/* Right Side: Actions */}
                          <div className="flex flex-row-reverse items-center md:gap-3 self-start md:flex-row md:self-auto">
                            <Button
                              variant="default"
                              size="lg"
                              onClick={() => handleAddToBetSlip(marketItem)}
                              className="w-28 text-base"
                            >
                              <Image
                                src="/susde-icon.svg"
                                alt="sUSDe"
                                width={20}
                                height={20}
                              />
                              Predict
                            </Button>
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
