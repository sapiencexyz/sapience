'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import type React from 'react';

interface MarketDialogOverlayProps {
  chainId: number;
  address: string;
  market: number;
}

// Utility function to get chain short name from chain ID
const getChainShortNameFromId = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return 'ethereum'; // Or 'eth' depending on desired format
    case 10:
      return 'optimism'; // Or 'op'
    case 8453:
      return 'base';
    case 42161:
      return 'arbitrum'; // Or 'arb'
    case 137:
      return 'polygon'; // Or 'poly'
    // Add other common chains as needed
    default:
      console.warn(`Unknown chainId: ${chainId}, using ID as fallback.`);
      return chainId.toString();
  }
};

const MarketDialogOverlay: React.FC<MarketDialogOverlayProps> = ({
  chainId,
  address,
  market,
}) => {
  // If you are still receiving chainId and need to convert:
  const chainShortName = getChainShortNameFromId(chainId);

  const dynamicUrl = `https://sapience.xyz/forecasting/${chainShortName}:${address}/${market}?password=nostradamus`;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-[425px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-medium">
            Trade this market on Sapience
          </DialogTitle>
        </DialogHeader>
        <div className="text-center">
          <Button asChild className="w-full" size="lg">
            <a href={dynamicUrl} target="_blank" rel="noopener noreferrer">
              Go to Sapience.xyz
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MarketDialogOverlay;
