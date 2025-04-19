'use client';

import Link from 'next/link';
import * as React from 'react';
import * as chains from 'viem/chains';

export interface MarketGroupsRowProps {
  chainId: number;
  marketAddress: string;
  markets: any[]; // Keep for now, might be needed for other logic or can be removed if unused
  color: string;
  displayQuestion: string; // Make displayQuestion required
  // Remove marketData prop
  // marketData?: any;
}

const MarketGroupsRow = ({
  chainId,
  marketAddress,
  markets, // Keep destructured for now
  color,
  displayQuestion, // Use the required prop directly
}: MarketGroupsRowProps) => {
  // Get chain short name for the URL
  const chainShortName = React.useMemo(
    () => getChainShortName(chainId),
    [chainId]
  );

  // Early return if no markets - Keep this check based on 'markets' prop for now
  if (!markets || markets.length === 0) {
    return null;
  }

  return (
    <Link href={`/forecasting/${chainShortName}:${marketAddress}`}>
      <div className="bg-background border-muted dark:bg-muted/50 flex hover:bg-secondary/20 transition-colors">
        <div
          className="w-1 min-w-[4px] max-w-[4px] translate-y-[0.5px]"
          style={{
            backgroundColor: color,
            margin: '-1px 0',
            alignSelf: 'stretch',
          }}
        />
        <div className="px-4 py-3">
          <h3 className="text-xl font-heading font-normal">
            {/* Use the displayQuestion prop directly */}
            {displayQuestion}
          </h3>
        </div>
      </div>
    </Link>
  );
};

export default MarketGroupsRow;

// Helper function to get chain short name from chainId
const getChainShortName = (id: number): string => {
  const chainObj = Object.values(chains).find((chain) => chain.id === id);
  return chainObj
    ? chainObj.name.toLowerCase().replace(/\s+/g, '')
    : id.toString();
};
