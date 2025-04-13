'use client';

import Link from 'next/link';
import * as React from 'react';
import * as chains from 'viem/chains';

// Assuming these hooks and types are correctly imported or defined elsewhere
// You might need to adjust imports based on your project structure
import {
  useMarketCandles,
  getLatestPriceFromCandles,
} from '~/lib/hooks/useMarketGroups';

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

  const { data: marketCandles } = useMarketCandles(marketInfo);

  const currentMarketPrice = React.useMemo(
    () => getLatestPriceFromCandles(marketCandles),
    [marketCandles]
  );

  console.log('currentMarketPrice', currentMarketPrice);

  // Get chain short name from chainId
  const getChainShortName = React.useCallback((id: number): string => {
    const chainObj = Object.values(chains).find((chain) => chain.id === id);
    return chainObj
      ? chainObj.name.toLowerCase().replace(/\s+/g, '')
      : id.toString();
  }, []);

  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId, getChainShortName]
  );

  // Early return after hooks are defined
  if (!epochs || epochs.length === 0) {
    return null;
  }

  return (
    // Wrap the entire content with Next.js Link
    <Link href={`/forecasting/${chainShortName}:${marketAddress}`}>
      <div className="bg-background rounded-lg overflow-hidden shadow-sm border border-muted border-t-0">
        <div className="h-1.5" style={{ backgroundColor: color }} />

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
