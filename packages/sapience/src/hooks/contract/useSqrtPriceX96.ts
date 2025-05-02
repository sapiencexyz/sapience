import type { Abi } from 'abitype';
import { useReadContract } from 'wagmi';

interface UseSqrtPriceX96Props {
  marketAddress?: `0x${string}`;
  marketId: bigint;
  enabled?: boolean;
  chainId?: number;
  marketAbi: Abi;
}

interface SqrtPriceResult {
  sqrtPriceX96: bigint;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch the current sqrt price from the market
 */
export function useSqrtPriceX96({
  marketAddress,
  marketId,
  enabled = true,
  chainId,
  marketAbi,
}: UseSqrtPriceX96Props): SqrtPriceResult {
  // Fetch the current sqrt price
  const {
    data: currentSqrtPrice,
    isError: isPriceError,
    isLoading: isCurrentPoolPriceLoading,
    error: errorData,
  } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'getSqrtPriceX96',
    chainId,
    args: [marketId],
    query: {
      enabled: enabled && !!marketAddress,
    },
  });

  return {
    sqrtPriceX96: (currentSqrtPrice as bigint) || BigInt(0),
    loading: isCurrentPoolPriceLoading,
    error: isPriceError
      ? new Error(errorData?.message || 'Failed to fetch current price')
      : null,
  };
}
