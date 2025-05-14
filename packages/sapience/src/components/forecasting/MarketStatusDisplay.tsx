/* eslint-disable sonarjs/cognitive-complexity */

import type { MarketGroupType, MarketType } from '@foil/ui/types';
import dynamic from 'next/dynamic';
import type React from 'react';

import { MarketGroupClassification } from '~/lib/types';
import { formatNumber } from '~/lib/utils/util';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

interface MarketStatusDisplayProps {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
}

const MarketStatusDisplay: React.FC<MarketStatusDisplayProps> = ({
  marketGroupData,
  marketClassification,
}) => {
  const firstMarket = marketGroupData.markets[0] as MarketType | undefined;

  if (!firstMarket) {
    return null;
  }

  const isExpired =
    firstMarket.endTimestamp &&
    Date.now() > Number(firstMarket.endTimestamp) * 1000;

  const isSettled = firstMarket.settled;

  if (!isExpired) {
    return null;
  }

  if (isExpired && !isSettled) {
    return (
      <div className="rounded-lg bg-secondary p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="py-2">
            <LottieLoader width={60} height={60} />
          </div>
          <h3 className="text-xl font-medium">Market Awaiting Settlement</h3>
          <p className="text-muted-foreground">
            This market has expired and is currently awaiting settlement by the
            oracle. Once settled, you will be able to view the results and claim
            any winnings.
          </p>
        </div>
      </div>
    );
  }

  if (isExpired && isSettled) {
    // Determine the display result based on market category
    let settlementResult: React.ReactNode;

    if (marketClassification === MarketGroupClassification.MULTIPLE_CHOICE) {
      // For single choice markets, find the option with settlement price of 1
      const settledMarket = marketGroupData.markets.find(
        (market) => market.settlementPriceD18 === '1000000000000000000' // 1 with 18 decimals
      );

      settlementResult = settledMarket?.optionName || 'Unknown option';
    } else if (marketClassification === MarketGroupClassification.YES_NO) {
      // For Yes/No markets, check if settlement price is 1 or 0
      const price = Number(firstMarket.settlementPriceD18) / 10 ** 18;
      settlementResult = price === 1 ? 'Yes' : 'No';
    } else {
      // For numeric markets, display the settlement price
      settlementResult = firstMarket.settlementPriceD18
        ? formatNumber(Number(firstMarket.settlementPriceD18) / 10 ** 18, 4)
        : 'Unknown';
    }

    return (
      <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="rounded-full bg-green-100 dark:bg-green-800 p-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-green-700 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-xl font-medium">Market Settled</h3>
          <p className="text-muted-foreground">
            This market has been settled with a result of{' '}
            <span className="font-semibold">{settlementResult}</span>. Check
            below for your positions.
          </p>
        </div>
      </div>
    );
  }

  return null;
};

export default MarketStatusDisplay;
