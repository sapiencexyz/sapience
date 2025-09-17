'use client';

import Link from 'next/link';
import Image from 'next/image';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@sapience/ui/components/ui/button';
import type { MarketWithContext } from './MarketsPage';
import MarketGroupSparkline from './MarketGroupSparkline';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import { DEFAULT_WAGER_AMOUNT } from '~/lib/utils/betslipUtils';
import type { MultiMarketChartDataPoint } from '~/lib/utils/chartUtils';

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

  // Compute a consistent minTimestamp (earliest start) to align sparkline X-axis with main chart
  const minSparklineTimestamp = React.useMemo(() => {
    const starts = sortedMarkets
      .map((m) =>
        typeof m.startTimestamp === 'number' ? m.startTimestamp : null
      )
      .filter((v): v is number => typeof v === 'number');
    return starts.length > 0 ? Math.min(...starts) : undefined;
  }, [sortedMarkets]);

  // Use the chart data hook to get latest prices
  const { chartData, isLoading: isLoadingChartData } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
  });

  // Determine if there is any sparkline data to render
  const hasSparklineData = React.useMemo(() => {
    return chartData.some((d: MultiMarketChartDataPoint) => {
      return !!d?.markets && Object.values(d.markets).some((v) => v != null);
    });
  }, [chartData]);

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
  const handleAddToBetSlip = (
    marketItem: MarketWithContext,
    prediction?: boolean,
    classificationOverride?: MarketGroupClassification
  ) => {
    const position = {
      // Treat prediction as long/short; for multichoice it's used for flip
      prediction: typeof prediction === 'boolean' ? prediction : true,
      marketAddress: marketAddress,
      marketId: marketItem.marketId,
      question: marketItem.question || marketItem.optionName || displayQuestion,
      chainId: chainId,
      marketClassification: classificationOverride || marketClassification,
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
          {isLoadingChartData ? 'Loading...' : <span>No wagers yet</span>}
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
          {isLoadingChartData ? 'Loading...' : 'No wagers yet'}
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
          <span>No wagers yet</span>
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
      <div className="bg-card border-muted flex flex-row transition-colors items-stretch min-h-[88px] md:min-h-[72px] relative">
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        {/* Content Container */}
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-4 pt-4 pb-6 md:py-2 gap-3">
          {/* Left Side: Question + Prediction */}
          <div className="flex-grow">
            <h3 className="text-md mb-1">
              <Link
                href={`/markets/${chainShortName}:${marketAddress}`}
                className="group"
              >
                <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                  {displayQuestion}
                </span>
              </Link>
            </h3>
            {/* Mobile-only: Sparkline above Market Prediction */}
            {hasSparklineData && (
              <div className="block md:hidden w-full h-[40px] my-2">
                <Link
                  href={`/markets/${chainShortName}:${marketAddress}`}
                  className="block w-full h-full"
                  aria-label="View market group"
                >
                  <MarketGroupSparkline
                    marketIds={marketIds}
                    rawChartData={chartData}
                    marketClassification={marketClassification}
                    minTimestamp={minSparklineTimestamp}
                    width="100%"
                  />
                </Link>
              </div>
            )}
            {/* Prediction Section (conditionally rendered) */}
            {canShowPredictionElement && (
              <div className="text-xs text-muted-foreground">
                <span className="text-muted-foreground">
                  Market Prediction:{' '}
                </span>
                <MarketPrediction />
              </div>
            )}
          </div>

          {/* Right Side: Sparkline + Action Buttons */}
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:gap-6 md:ml-6 w-full md:w-auto">
            {hasSparklineData && (
              <div className="hidden md:block w-[80px] h-[40px]">
                <Link
                  href={`/markets/${chainShortName}:${marketAddress}`}
                  className="block w-full h-full"
                  aria-label="View market group"
                >
                  <MarketGroupSparkline
                    marketIds={marketIds}
                    rawChartData={chartData}
                    marketClassification={marketClassification}
                    minTimestamp={minSparklineTimestamp}
                  />
                </Link>
              </div>
            )}
            <div className="flex flex-row-reverse items-center gap-3 md:flex-row w-full md:w-auto">
              {marketClassification ===
              MarketGroupClassificationEnum.MULTIPLE_CHOICE ? (
                // For multichoice markets, show only the dropdown toggle
                <>
                  {isActive ? (
                    <Button
                      variant="outline"
                      className="w-full md:w-28 md:min-w-[160px] text-base"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                      }}
                    >
                      <span className="flex items-center gap-1 text-foreground/80">
                        {isExpanded ? 'Hide Options' : 'Show Options'}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="w-full md:w-28 md:min-w-[160px] text-base"
                      asChild
                    >
                      <Link
                        href={`/markets/${chainShortName}:${marketAddress}`}
                        className="group inline-flex items-center"
                      >
                        <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                          Closed
                        </span>
                      </Link>
                    </Button>
                  )}
                </>
              ) : // For non-multichoice markets
              activeMarket ? (
                <>
                  {marketClassification ===
                  MarketGroupClassificationEnum.NUMERIC ? (
                    // Numeric markets keep single action
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
                  ) : (
                    // YES/NO markets: combined split button
                    (() => {
                      const yesMarket =
                        market.find((m) => m.optionName === 'Yes') ||
                        activeMarket;
                      const noMarket =
                        market.find((m) => m.optionName === 'No') ||
                        activeMarket;
                      return (
                        <YesNoSplitButton
                          onYes={() => handleAddToBetSlip(yesMarket, true)}
                          onNo={() => handleAddToBetSlip(noMarket, false)}
                          className="w-full md:min-w-[10rem]"
                          size="lg"
                        />
                      );
                    })()
                  )}
                </>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full md:min-w-[10rem]"
                  size="lg"
                  asChild
                >
                  <Link
                    href={`/markets/${chainShortName}:${marketAddress}`}
                    className="group inline-flex items-center"
                  >
                    Closed
                  </Link>
                </Button>
              )}
            </div>
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
              <div className="px-4  bg-card">
                {/* Panel Content */}
                <div className="overflow-visible">
                  {sortedMarkets.length > 0 ? (
                    <div>
                      {sortedMarkets.map((marketItem) => (
                        <div
                          key={marketItem.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between py-3 border-t border-border gap-3"
                        >
                          {/* Left Side: Option Name + Prediction */}
                          <div className="flex-grow">
                            <div className="text-foreground inline-flex items-center gap-2 mb-1">
                              <Link
                                href={`/markets/${chainShortName}:${marketAddress}/${marketItem.marketId}`}
                                className="group inline-flex items-center"
                              >
                                <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                                  {marketItem.optionName ||
                                    `Market ${marketItem.marketId}`}
                                </span>
                              </Link>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-muted-foreground">
                                Market Prediction:{' '}
                              </span>
                              <IndividualMarketPrediction
                                marketItem={marketItem}
                              />
                            </div>
                          </div>

                          {/* Right Side: Actions */}
                          <div className="flex flex-row-reverse items-center md:gap-3 self-start md:flex-row md:self-auto w-full md:w-auto">
                            {/* For multichoice rows, add as MULTIPLE_CHOICE and set long/short via prediction */}
                            <YesNoSplitButton
                              onYes={() =>
                                handleAddToBetSlip(
                                  marketItem,
                                  true,
                                  MarketGroupClassificationEnum.MULTIPLE_CHOICE
                                )
                              }
                              onNo={() =>
                                handleAddToBetSlip(
                                  marketItem,
                                  false,
                                  MarketGroupClassificationEnum.MULTIPLE_CHOICE
                                )
                              }
                              className="w-full md:min-w-[10rem]"
                              size="lg"
                            />
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
