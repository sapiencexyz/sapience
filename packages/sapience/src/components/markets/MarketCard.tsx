'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import * as React from 'react';
import type { MarketWithContext } from './MarketsPage';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { DEFAULT_WAGER_AMOUNT } from '~/lib/utils/betslipUtils';

export interface MarketCardProps {
  chainId: number;
  marketAddress: string;
  market: MarketWithContext[];
  color: string;
  displayQuestion: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

const MarketCard = ({
  chainId,
  marketAddress,
  market,
  color,
  displayQuestion,
  isActive,
  marketClassification,
  displayUnit,
}: MarketCardProps) => {
  const { addPosition } = useBetSlipContext();
  const router = useRouter();

  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  const sortedMarkets = React.useMemo(
    () => [...market].sort((a, b) => a.marketId - b.marketId),
    [market]
  );

  const marketIds = React.useMemo(
    () => sortedMarkets.map((m) => m.marketId),
    [sortedMarkets]
  );

  const { chartData, isLoading: isLoadingChartData } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
  });

  const latestPrices = React.useMemo(() => {
    if (chartData.length === 0) return {} as Record<number, number>;

    const latestDataPoint = chartData[chartData.length - 1];
    const prices: Record<number, number> = {};

    if (latestDataPoint.markets) {
      Object.entries(latestDataPoint.markets).forEach(
        ([marketIdStr, value]) => {
          if (typeof value === 'number') {
            prices[parseInt(marketIdStr)] = value / 1e18;
          }
        }
      );
    }

    return prices;
  }, [chartData]);

  const formatPriceAsPercentage = (price: number) => {
    if (price <= 0) return 'Price N/A';
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
      prediction: typeof prediction === 'boolean' ? prediction : true,
      marketAddress,
      marketId: marketItem.marketId,
      question: marketItem.question || marketItem.optionName || displayQuestion,
      chainId,
      marketClassification: classificationOverride || marketClassification,
      wagerAmount: DEFAULT_WAGER_AMOUNT,
    };
    addPosition(position);
  };

  // Handler for Yes button
  const handleYesClick = () => {
    const yesMarket = market.find((m) => m.optionName === 'Yes') || market[0];
    handleAddToBetSlip(yesMarket, true);
    router.push('/markets');
  };

  // Handler for No button
  const handleNoClick = () => {
    const noMarket = market.find((m) => m.optionName === 'No') || market[0];
    handleAddToBetSlip(noMarket, false);
    router.push('/markets');
  };

  const MarketPrediction = () => {
    if (!isActive || market.length === 0) return null;

    if (
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
    ) {
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
      let targetMarket = market[0];

      if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
        targetMarket = market.find((m) => m.optionName === 'Yes') || market[0];
      }

      const currentPrice = latestPrices[targetMarket.marketId] || 0;

      if (currentPrice > 0) {
        if (marketClassification === MarketGroupClassificationEnum.NUMERIC) {
          return (
            <span className="font-medium text-foreground">
              {currentPrice.toFixed(2)}
              {displayUnit && <span className="ml-1">{displayUnit}</span>}
            </span>
          );
        } else {
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

  const canShowPredictionElement = isActive && market.length > 0;

  return (
    <div className="w-full h-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="bg-background border rounded-md border-border/70 dark:bg-muted/50 flex flex-row items-stretch h-full relative overflow-hidden shadow shadow-md transition-shadow duration-200"
      >
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        <div className="flex-1 flex flex-col h-full">
          <div className="block group flex-1">
            <div className="transition-colors h-full">
              <div className="flex flex-col px-4 py-3 gap-3 h-full">
                <div className="flex flex-col h-full min-w-0">
                  <h3 className="text-sm md:text-base leading-snug mb-1">
                    <Link
                      href={`/markets/${chainShortName}:${marketAddress}`}
                      className="group"
                    >
                      <span
                        className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors block overflow-hidden group-hover:decoration-foreground/60"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {displayQuestion}
                      </span>
                    </Link>
                  </h3>
                  {canShowPredictionElement && (
                    <div className="text-xs md:text-sm text-muted-foreground mt-auto w-full">
                      <div className="truncate whitespace-nowrap min-w-0">
                        <span className="text-muted-foreground">
                          Market Prediction{' '}
                        </span>
                        <MarketPrediction />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 pt-0">
            {isActive &&
              marketClassification ===
                MarketGroupClassificationEnum.MULTIPLE_CHOICE && (
                <YesNoSplitButton
                  onYes={() => {
                    if (market.length === 0) return;
                    const marketPriceData = market.map((marketItem) => ({
                      marketItem,
                      price: latestPrices[marketItem.marketId] || 0,
                    }));
                    const highestPricedMarket = marketPriceData.reduce(
                      (highest, current) =>
                        current.price > highest.price ? current : highest
                    );
                    const selectedMarket =
                      highestPricedMarket.price > 0
                        ? highestPricedMarket.marketItem
                        : sortedMarkets[0];
                    handleAddToBetSlip(
                      selectedMarket,
                      true,
                      MarketGroupClassificationEnum.YES_NO
                    );
                    router.push('/markets');
                  }}
                  onNo={() => {
                    if (market.length === 0) return;
                    const marketPriceData = market.map((marketItem) => ({
                      marketItem,
                      price: latestPrices[marketItem.marketId] || 0,
                    }));
                    const highestPricedMarket = marketPriceData.reduce(
                      (highest, current) =>
                        current.price > highest.price ? current : highest
                    );
                    const selectedMarket =
                      highestPricedMarket.price > 0
                        ? highestPricedMarket.marketItem
                        : sortedMarkets[0];
                    handleAddToBetSlip(
                      selectedMarket,
                      false,
                      MarketGroupClassificationEnum.YES_NO
                    );
                    router.push('/markets');
                  }}
                  className="w-full"
                  size="md"
                />
              )}
            {isActive &&
              marketClassification === MarketGroupClassificationEnum.YES_NO && (
                <YesNoSplitButton
                  onYes={handleYesClick}
                  onNo={handleNoClick}
                  className="w-full"
                  size="md"
                />
              )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MarketCard;
