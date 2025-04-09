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

// Define the structure for market candles if available, otherwise use any
// interface MarketCandle { timestamp: number; price: number; }

// PredictionPreview component
export interface MarketPreviewProps {
  endTime: number; // Replaces endTimestamp
  totalLiquidity: number; // New prop
  totalVolume: number; // New prop
  collateralTicker: string; // New prop
  marketCategorySlug: string; // Replaces focusAreaSlug
  marketQuestion: string; // Replaces question
  // Keep chainId and marketAddress for the link for now
  chainId: number;
  marketAddress: string;
  // Removed: settled, color, epochId
}

export const MarketPreview = ({
  endTime,
  totalLiquidity,
  totalVolume,
  collateralTicker,
  marketCategorySlug,
  marketQuestion,
  chainId,
  marketAddress,
}: MarketPreviewProps) => {

  // TODO: Format liquidity and volume numbers appropriately
  // Add fallback to 0 if undefined/null before formatting
  const formattedLiquidity = `${(totalLiquidity ?? 0).toLocaleString()}`;
  const formattedVolume = `${(totalVolume ?? 0).toLocaleString()}`;

  // TODO: Determine if market is settled based on endTime
  const isSettled = new Date().getTime() / 1000 > endTime;

  return (
    // Remove the Card component and Link component wrapping the content
    // The MarketGroupPreview now handles the card styling and link
    // TODO: Update link href generation if necessary in MarketGroupPreview or parent
    <div className="overflow-hidden"> {/* Keep overflow-hidden if needed for internal elements */}
        {/* Gauge and chart removed */}
        {/* Footer with detailed information */}
        <div className="px-6 py-4 bg-muted">
          <div className="flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center gap-4 text-sm">
            <div className="flex items-center text-gray-500">
              {!isSettled && ( // Use derived isSettled status
                <div className="flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  <span>
                    Closes in{' '}
                    {formatDistanceToNow(new Date(endTime * 1000))} {/* Use endTime prop */}
                  </span>
                </div>
              )}
              {isSettled && ( // Use derived isSettled status
                <div className="flex items-center">
                  <CheckCircleIcon className="h-4 w-4 mr-1" />
                  <span>
                    Closed{' '}
                    {formatDistance(new Date(endTime * 1000), new Date(), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center text-gray-500">
              <ScaleIcon className="h-4 w-4 mr-1" />
              <span>Liquidity: {formattedLiquidity}</span> {/* Use totalLiquidity prop */}
            </div>

            <div className="flex items-center text-gray-500">
              <BarChart2Icon className="h-4 w-4 mr-1" />
              <span>Volume: {formattedVolume}</span> {/* Use totalVolume prop */}
            </div>

            <div className="flex items-center text-gray-500">
              <span className="flex items-center">
                {/* Farcaster icon */}
                <svg
                  className="h-4 w-4 mr-1"
                  viewBox="0 0 1000 1000"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z"
                    fill="currentColor"
                  />
                  <path
                    d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z"
                    fill="currentColor"
                  />
                  <path
                    d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Channel: {marketCategorySlug}</span> {/* Use marketCategorySlug prop */}
              </span>
            </div>
          </div>
        </div>
    </div>
  );
}; 