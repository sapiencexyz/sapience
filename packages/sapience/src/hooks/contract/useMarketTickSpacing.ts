import { useEffect, useState } from 'react';
import type { Abi, Address } from 'viem';
import { useReadContract } from 'wagmi';

interface UseMarketTickSpacingProps {
  marketAddress?: Address;
  abi?: Abi;
  chainId?: number;
  enabled?: boolean;
}

interface UseMarketTickSpacingResult {
  tickSpacing: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch the tick spacing from the market contract
 */
export function useMarketTickSpacing({
  marketAddress,
  abi,
  chainId,
  enabled = true,
}: UseMarketTickSpacingProps): UseMarketTickSpacingResult {
  const [error, setError] = useState<Error | null>(null);

  const {
    data: rawTickSpacing,
    isLoading,
    isError,
    error: contractError,
  } = useReadContract({
    address: marketAddress,
    abi,
    functionName: 'getMarketTickSpacing',
    chainId,
    query: {
      enabled: enabled && !!marketAddress && !!abi,
    },
  });

  // Set error if contract call fails
  useEffect(() => {
    if (isError && contractError) {
      setError(contractError);
    } else {
      setError(null);
    }
  }, [isError, contractError]);

  // Convert the raw tick spacing to a number
  const tickSpacing = Number(rawTickSpacing || 0);

  return {
    tickSpacing,
    isLoading,
    error,
  };
}
