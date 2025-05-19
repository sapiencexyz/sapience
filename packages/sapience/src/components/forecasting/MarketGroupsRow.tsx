'use client';

import Link from 'next/link';
import * as React from 'react';
import { formatUnits } from 'viem';

import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { getChainShortName } from '~/lib/utils/util';

// Import the shared type
import type { MarketWithContext } from './MarketGroupsList';

export interface MarketGroupsRowProps {
  chainId: number;
  marketAddress: string;
  markets: MarketWithContext[];
  color: string;
  displayQuestion: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

const MarketGroupsRow = ({
  chainId,
  marketAddress,
  markets,
  color,
  displayQuestion,
  isActive,
  marketClassification,
  displayUnit,
}: MarketGroupsRowProps) => {
  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  const highestPricedMarketOption = React.useMemo(() => {
    if (
      !isActive ||
      marketClassification !== MarketGroupClassificationEnum.MULTIPLE_CHOICE ||
      markets.length === 0
    )
      return null;

    let highestPrice = BigInt(-1);
    let optionNameWithHighestPrice: string | null | undefined = null;

    markets.forEach((market) => {
      if (market.currentPrice && typeof market.currentPrice === 'string') {
        try {
          const currentPriceBigInt = BigInt(market.currentPrice);
          if (currentPriceBigInt > highestPrice) {
            highestPrice = currentPriceBigInt;
            optionNameWithHighestPrice = market.optionName;
          }
        } catch {
          /* ignore error, keep searching */
        }
      }
    });
    return optionNameWithHighestPrice;
  }, [isActive, marketClassification, markets]);

  const yesNoPredictionPercentage = React.useMemo(() => {
    if (
      !isActive ||
      marketClassification !== MarketGroupClassificationEnum.YES_NO ||
      markets.length === 0
    )
      return null;

    let targetMarket = markets.find((m) => m.optionName === 'Yes');
    if (!targetMarket && markets.length > 0) [targetMarket] = markets;

    if (
      targetMarket &&
      targetMarket.currentPrice &&
      typeof targetMarket.currentPrice === 'string'
    ) {
      try {
        const percentage = Math.round(
          Number(formatUnits(BigInt(targetMarket.currentPrice), 18)) * 100
        );
        if (Number.isNaN(percentage)) return null;
        return `${percentage}% Chance`;
      } catch {
        return null;
      }
    }
    return null;
  }, [isActive, marketClassification, markets]);

  const numericFormattedPriceDisplay = React.useMemo(() => {
    if (
      !isActive ||
      markets.length === 0 ||
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE ||
      marketClassification === MarketGroupClassificationEnum.YES_NO
    ) {
      return null;
    }
    const marketToDisplay = markets[0];
    if (
      marketToDisplay.currentPrice &&
      typeof marketToDisplay.currentPrice === 'string'
    ) {
      try {
        const priceInEther = formatUnits(
          BigInt(marketToDisplay.currentPrice),
          18
        );
        const formatted = Number(priceInEther).toFixed(4);
        if (formatted === 'NaN') return null;
        return formatted;
      } catch (error) {
        console.error(
          'Error formatting currentPrice for numeric display:',
          error
        );
        return null;
      }
    }
    return null;
  }, [isActive, marketClassification, markets]);

  if (!markets || markets.length === 0) {
    return null;
  }

  const canShowPredictionElement =
    isActive &&
    ((marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE &&
      highestPricedMarketOption) ||
      (marketClassification === MarketGroupClassificationEnum.YES_NO &&
        yesNoPredictionPercentage) ||
      (marketClassification !== MarketGroupClassificationEnum.MULTIPLE_CHOICE &&
        marketClassification !== MarketGroupClassificationEnum.YES_NO &&
        numericFormattedPriceDisplay));

  let predictionContent;
  if (marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE) {
    predictionContent = highestPricedMarketOption;
  } else if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
    predictionContent = yesNoPredictionPercentage;
  } else {
    predictionContent = (
      <>
        {numericFormattedPriceDisplay}
        {displayUnit &&
          marketClassification === MarketGroupClassificationEnum.NUMERIC && (
            <span className="ml-1">{displayUnit}</span>
          )}
      </>
    );
  }

  return (
    <Link href={`/forecasting/${chainShortName}:${marketAddress}`}>
      {/* Main Row Container for Color Bar + Content */}
      <div className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch">
        {/* Colored Bar (Full Height) */}
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />

        {/* Content Container (stacks Question & Prediction on mobile, row on desktop) */}
        <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
          {/* Question Section */}
          <div className="pb-3 lg:pb-0 lg:pr-5">
            <h3 className="text-xl font-heading font-normal">
              {displayQuestion}
            </h3>
          </div>

          {/* Prediction Section (conditionally rendered) */}
          {canShowPredictionElement && (
            // This div handles the responsive line *within* the prediction block
            <div className="text-sm text-muted-foreground w-full lg:w-auto flex flex-col lg:flex-row lg:items-center lg:ml-auto lg:min-w-[280px]">
              {/* Responsive Gray Line (internal to prediction block) */}
              <div className="bg-border w-full h-px mb-1 lg:w-px lg:h-auto lg:self-stretch lg:mr-5 lg:mb-0" />
              {/* Prediction Text Content */}
              <div className="mt-2 lg:mt-0">
                <div className="whitespace-nowrap">
                  Current Market Prediction
                </div>
                <div className="text-lg font-medium text-foreground">
                  {predictionContent}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default MarketGroupsRow;
