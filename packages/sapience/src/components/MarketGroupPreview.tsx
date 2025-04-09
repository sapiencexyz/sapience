'use client';

import { Card } from '@foil/ui/components/ui/card';
import { formatDistance, formatDistanceToNow } from 'date-fns';
import {
  ClockIcon,
  CheckCircleIcon,
  ScaleIcon,
  BarChart2Icon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@foil/ui/components/ui/accordion';

// Assuming these hooks and types are correctly imported or defined elsewhere
// You might need to adjust imports based on your project structure
import {
  useMarketCandles,
  useTotalVolume,
  getLatestPriceFromCandles,
} from '~/lib/hooks/useMarketGroups';
import { Skeleton } from '@foil/ui/components/ui/skeleton';
import { MarketPreview } from './MarketPreview';

// --- EpochMarketPreviewLoader Component --- //
interface EpochMarketPreviewLoaderProps {
  chainId: number;
  marketAddress: string;
  epoch: any;
  marketCategorySlug: string;
  color: string; // Pass color down
  iconPath: string; // Pass icon path down
  marketName: string; // Pass market name down
  // Add any other props needed by MarketPreview that come from the epoch or group
  collateralAsset: string;
  // Assuming min/max tick might come from market or epoch level, pass them if needed
  // If they are static/hardcoded, they could be defined directly in MarketPreview
  minTick: number; // Example: pass down
  maxTick: number; // Example: pass down
  totalLiquidity: number; // Example: pass down if available, otherwise fetch if needed
}

const EpochMarketPreviewLoader: React.FC<EpochMarketPreviewLoaderProps> = ({
  chainId,
  marketAddress,
  epoch,
  marketCategorySlug,
  collateralAsset, // Renamed from collateralTicker for consistency
  color,
  iconPath,
  marketName,
  minTick,
  maxTick,
  totalLiquidity,
}) => {
  const marketInfo = React.useMemo(
    () => ({ address: marketAddress, chainId, epochId: epoch.epochId }),
    [marketAddress, chainId, epoch.epochId]
  );

  const { data: marketCandles, isLoading: isLoadingCandles } =
    useMarketCandles(marketInfo);

  const { data: totalVolumeData, isLoading: isLoadingVolume } =
    useTotalVolume(marketInfo);

  const currentMarketPrice = React.useMemo(
    () => getLatestPriceFromCandles(marketCandles),
    [marketCandles]
  );

  if (isLoadingCandles || isLoadingVolume) {
    // Use the skeleton structure from the previous implementation
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full border-t-[6px]" style={{ borderTopColor: color }} />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
      </div>
    );
  }

  // Prepare props for MarketPreview
  // Note: Ensure prop names match what MarketPreview expects
  const marketPreviewProps = {
    endTime: epoch.endTimestamp, // Assuming MarketPreview expects endTime
    totalLiquidity: totalLiquidity, // Pass down the provided totalLiquidity
    totalVolume: totalVolumeData ?? 0,
    collateralTicker: collateralAsset,
    marketCategorySlug: marketCategorySlug,
    marketQuestion: epoch.question ?? 'N/A', // Assuming MarketPreview expects marketQuestion
    chainId: chainId,
    marketAddress: marketAddress,
    // Pass color, iconPath, marketName if MarketPreview needs them - these are not needed by MarketPreview anymore
    // Removed color, iconPath, marketName
    // Add any other necessary props
  };

  const yesProb = Math.round(currentMarketPrice ?? 0); // Calculate yesProb here

  return (
    <> {/* Use a fragment to wrap multiple elements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 border-b">
        {/* Left side - Probability gauge (1/3 width) */}
        <div className="p-6 pb-0 flex flex-col items-center justify-center">
          {/* Gauge container with relative positioning */}
          <div className="relative w-full flex flex-col items-center">
            {/* Half circle gauge - wider */}
            <div className="w-full max-w-[200px]">
              <svg
                width="100%"
                viewBox="0 0 100 55"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Background half circle */}
                <path
                  d="M 5 50 A 45 45 0 0 1 95 50"
                  fill="none"
                  stroke="#f0f0f0"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Colored progress half circle */}
                <path
                  d="M 5 50 A 45 45 0 0 1 95 50"
                  fill="none"
                  stroke={color} // Use the 'color' prop passed down
                  strokeWidth="2"
                  strokeDasharray={`${yesProb * 1.41} 141`} // Use calculated probability
                  strokeDashoffset="0"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Percentage - positioned to overlap the bottom of the arc */}
            <div className="absolute top-[28px] left-0 right-0 flex flex-col items-center">
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

        {/* Right side - Price chart (2/3 width) */}
        <div className="p-6 pb-0 flex flex-col md:col-span-2">
          <div className="h-32 w-full relative">
            {/* Simplified chart representation */}
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              Chart Placeholder (using {marketCandles ? marketCandles.length : 0} candles) {/* Update placeholder */}
            </div>
          </div>
        </div>
      </div>

      <MarketPreview {...marketPreviewProps} /> {/* Existing component call */}
    </>
  );
};
// --- End of EpochMarketPreviewLoader --- //


// Update MarketGroupPreviewProps to accept EpochWithMarketInfo
export interface MarketGroupPreviewProps {
  marketCategorySlug: string;
  chainId: number;
  marketAddress: string;
  epochs: any[]; // Use 'any[]' for now, type inference should handle it
  // Add props that apply to the whole group and need to be passed down
  color: string;
  iconPath: string;
  marketName: string;
  collateralAsset: string;
  // Pass down potentially static values if they apply to all epochs in the group
  minTick: number;
  maxTick: number;
  totalLiquidity: number; // Assuming this might be a group-level or placeholder value
}

export const MarketGroupPreview = ({
  marketCategorySlug,
  chainId,
  marketAddress,
  epochs,
  color,
  iconPath,
  marketName,
  collateralAsset,
  minTick,
  maxTick,
  totalLiquidity, // Receive the potentially hardcoded value
}: MarketGroupPreviewProps) => {
  if (!epochs || epochs.length === 0) {
    return null;
  }

  // Generate a stable key for the first epoch if it exists
  const firstEpochKey = epochs.length > 0 ? `${marketAddress}:${epochs[0].epochId}` : undefined;

  return (
    <div
      className="bg-background rounded-2xl overflow-hidden shadow-sm border border-muted border-t-0 space-y-4"
    >
      <div className="h-3" style={{ backgroundColor: color }} />

      {epochs.length > 1 ? (
        <Accordion type="single" collapsible className="w-full" defaultValue={firstEpochKey}>
          {epochs.map((epoch: any) => {
            const epochKey = `${marketAddress}:${epoch.epochId}`;
            return (
              <AccordionItem value={epochKey} key={epochKey}>
                <AccordionTrigger className="text-2xl font-heading font-normal hover:no-underline px-8">
                  {epoch.question}
                </AccordionTrigger>
                <AccordionContent className="py-0">
                  <EpochMarketPreviewLoader
                    chainId={chainId}
                    marketAddress={marketAddress}
                    epoch={epoch} // Pass the full epoch object
                    marketCategorySlug={marketCategorySlug}
                    collateralAsset={collateralAsset} // Pass from group props
                    color={color} // Pass from group props
                    iconPath={iconPath} // Pass from group props
                    marketName={marketName} // Pass market name (consider if needed if trigger shows it)
                    minTick={minTick} // Pass down from group props
                    maxTick={maxTick} // Pass down from group props
                    totalLiquidity={totalLiquidity} // Pass down the value
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : (
        // Render the single epoch directly if only one exists
        epochs.map((epoch: any) => (
          <div key={`${marketAddress}:${epoch.epochId}`}>
            <EpochMarketPreviewLoader
              chainId={chainId}
              marketAddress={marketAddress}
              epoch={epoch}
              marketCategorySlug={marketCategorySlug}
              collateralAsset={collateralAsset}
              color={color}
              iconPath={iconPath}
              marketName={marketName}
              minTick={minTick}
              maxTick={maxTick}
              totalLiquidity={totalLiquidity}
            />
          </div>
        ))
      )}
    </div>
  );
}; 