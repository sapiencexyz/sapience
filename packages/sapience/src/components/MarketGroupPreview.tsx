'use client';

import { Skeleton } from '@foil/ui/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ClockIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import * as React from 'react';

// Assuming these hooks and types are correctly imported or defined elsewhere
// You might need to adjust imports based on your project structure
import {
  useMarketCandles,
  getLatestPriceFromCandles,
} from '~/lib/hooks/useMarketGroups';

// Dynamically import the chart component
const MarketGroupPreviewChart = dynamic(
  () =>
    import('./MarketGroupPreviewChart').then(
      (mod) => mod.MarketGroupPreviewChart
    ),
  {
    ssr: false, // Disable server-side rendering for this component
    loading: () => (
      // Optional: Add a loading state placeholder
      <div className="h-32 w-full flex items-center justify-center text-muted-foreground">
        Loading chart...
      </div>
    ),
  }
);

// Update MarketGroupPreviewProps to accept displayQuestion
export interface MarketGroupPreviewProps {
  chainId: number;
  marketAddress: string;
  epochs: any[]; // Consider using EpochWithMarketInfo[] from MarketGroupsList if exported
  color: string;
  displayQuestion?: string; // Add the optional display question prop
}

export const MarketGroupPreview = ({
  chainId,
  marketAddress,
  epochs,
  color,
  displayQuestion, // Destructure the new prop
}: MarketGroupPreviewProps) => {
  // Get the first epoch if available
  const firstEpoch = epochs?.[0];

  // Fetch market candles and calculate probability for the first epoch
  const marketInfo = React.useMemo(
    () =>
      firstEpoch
        ? {
            address: marketAddress,
            chainId,
            epochId: Number(firstEpoch.epochId),
          }
        : { address: marketAddress, chainId, epochId: 0 },
    [marketAddress, chainId, firstEpoch]
  );

  const { data: marketCandles, isLoading: isLoadingCandles } =
    useMarketCandles(marketInfo);

  const currentMarketPrice = React.useMemo(
    () => getLatestPriceFromCandles(marketCandles),
    [marketCandles]
  );

  // Early return after hooks are defined
  if (!epochs || epochs.length === 0) {
    return null;
  }

  // Log to see what's happening
  // console.log('MarketGroupPreview candles:', {
  //   marketInfo,
  //   marketCandlesLength: marketCandles?.length || 0,
  //   firstEpochInfo: firstEpoch
  //     ? {
  //         epochId: firstEpoch.epochId,
  //         question: firstEpoch.question,
  //       }
  //     : 'No first epoch',
  // });

  const yesProb = Math.round(currentMarketPrice ?? 0); // Calculate yesProb here

  return (
    // Wrap the entire content with Next.js Link
    <Link href={`/forecasting/${chainId}/${marketAddress}`}>
      <div className="bg-background rounded-lg overflow-hidden shadow-sm border border-muted border-t-0">
        <div className="h-1.5" style={{ backgroundColor: color }} />

        {/* Gauge and Chart section */}
        {isLoadingCandles ? (
          <div className="p-6 pb-0">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 border-b hidden">
            {/* Left side - Probability Value */}
            <div className="p-6 pb-0 flex flex-col items-center justify-center">
              <div className="relative w-full flex flex-col items-center">
                <div className="flex flex-col items-center pt-8">
                  <span
                    style={{
                      fontSize: '36px',
                      fontWeight: '500',
                      letterSpacing: '-0.5px',
                      borderRadius: '8px',
                      padding: '0 8px',
                    }}
                  >
                    {yesProb}
                  </span>
                  <span className="text-gray-500 text-sm mt-1">gwei</span>
                </div>
              </div>
            </div>

            {/* Right side - Price chart */}
            <div className="p-6 pb-0 flex flex-col md:col-span-2">
              <div className="h-32 w-full relative">
                <MarketGroupPreviewChart
                  epochs={epochs}
                  marketCandles={marketCandles || []}
                  marketInfo={{
                    address: marketAddress,
                    chainId,
                    epochId: firstEpoch?.epochId || 0,
                  }}
                  isLoading={isLoadingCandles}
                />
              </div>
              {firstEpoch && firstEpoch.endTimestamp && (
                <div className="flex items-center justify-end mt-2 text-gray-500">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  <span className="text-xs">
                    Closes in{' '}
                    {formatDistanceToNow(
                      new Date(firstEpoch.endTimestamp * 1000)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {/* End of Gauge and Chart section */}

        <div className="px-6 py-4">
          {/* Display the single determined question if available */}
          {displayQuestion && (
            <h3 className="text-3xl font-heading font-normal">
              {displayQuestion}
            </h3>
          )}
        </div>
      </div>
    </Link>
  );
};
