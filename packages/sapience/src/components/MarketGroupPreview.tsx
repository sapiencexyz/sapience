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

  const { data: totalVolumeData, isLoading: isLoadingVolume } =
    useTotalVolume(marketInfo);

  if (isLoadingVolume) {
    // Keep the skeleton as it uses color for the border
    return (
      <div className="space-y-3 p-6 pt-0">
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

  // Return only the MarketPreview component now, without the gauge/chart div
  return (
    <MarketPreview {...marketPreviewProps} />
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
  const firstEpoch = epochs[0]; // Get the first epoch for gauge/chart data
  const firstEpochKey = firstEpoch ? `${marketAddress}:${firstEpoch.epochId}` : undefined;

  // Fetch market candles and calculate probability for the first epoch
  const marketInfo = React.useMemo(
    () => (firstEpoch ? { address: marketAddress, chainId, epochId: Number(firstEpoch.epochId) } : undefined),
    [marketAddress, chainId, firstEpoch]
  );

  // Pass marketInfo!; assert non-null because we check epochs.length > 0
  // Assuming hook handles undefined internally by disabling, but TS needs assurance.
  const { data: marketCandles, isLoading: isLoadingCandles } = useMarketCandles(marketInfo!);

  const currentMarketPrice = React.useMemo(
    () => getLatestPriceFromCandles(marketCandles),
    [marketCandles]
  );

  const yesProb = Math.round(currentMarketPrice ?? 0); // Calculate yesProb here

  return (
    // Wrap the entire content with Next.js Link
    <Link href={`/predictions/${chainId}:${marketAddress}`}>
      <div
        className="bg-background rounded-lg overflow-hidden shadow-sm border border-muted border-t-0"
      >
        <div className="h-1.5" style={{ backgroundColor: color }} />

        {/* Gauge and Chart section - moved from EpochMarketPreviewLoader */}
        {isLoadingCandles ? (
           <div className="p-6 pb-0"> <Skeleton className="h-40 w-full" /> </div>
        ) : (
          // Restore the 3-column grid layout
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 border-b">
            {/* Left side - Probability Value (Re-added without SVG) */}
            <div className="p-6 pb-0 flex flex-col items-center justify-center">
              {/* Container for the value and unit */}
              <div className="relative w-full flex flex-col items-center">
                {/* SVG element is NOT included */}
                {/* Value and unit */}
                <div className="flex flex-col items-center pt-8"> {/* Added pt-8 for spacing */} 
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

            {/* Right side - Price chart (Restore md:col-span-2) */}
            <div className="p-6 pb-0 flex flex-col md:col-span-2">
              <div className="h-32 w-full relative">
                {/* Simplified chart representation */}
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  Chart Placeholder (using {marketCandles ? marketCandles.length : 0} candles)
                </div>
              </div>
            </div>
          </div>
        )}
        {/* End of Gauge and Chart section */}

        {/* List of Epochs - Replaced Accordion */}
        <div className="px-6 py-4"> {/* Add padding around the list */} 
          {epochs.map((epoch: any, index: number) => {
            const epochKey = `${marketAddress}:${epoch.epochId}`;
            return (
              <div key={epochKey} className={index > 0 ? "mt-6 pt-6 border-t" : ""}> {/* Add margin and border top for subsequent epochs */} 
                {/* Display the question */}
                <h3 className="text-lg font-heading font-normal mb-4">{epoch.question}</h3> {/* Adjusted styling */} 
                {/* Render the EpochMarketPreviewLoader */}
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
            );
          })}
        </div>
      </div>
    </Link>
  );
}; 