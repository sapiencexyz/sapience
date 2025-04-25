import { TickMath } from '@uniswap/v3-sdk';
import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { useSqrtPriceX96 } from './useSqrtPriceX96';

interface ModifyQuoteResult {
  amount0: bigint;
  amount1: bigint;
  collateralAmount: bigint;
  newLiquidity: bigint;
  liquidityDelta: bigint;
  loading: boolean;
  error: Error | null;
}

interface ModifyLiquidityQuoterProps {
  marketAddress?: `0x${string}`;
  positionId: string;
  currentLiquidity?: bigint;
  percentage: number; // 1-100 percentage value
  mode: 'add' | 'remove'; // Whether we're adding or removing liquidity
  enabled?: boolean;
  chainId?: number;
  marketAbi: any;
  marketId: bigint;
  tickLower?: number;
  tickUpper?: number;
}

/**
 * Hook to fetch token amounts and collateral requirements when modifying an existing position
 */
export function useModifyLiquidityQuoter({
  marketAddress,
  positionId,
  currentLiquidity = BigInt(0),
  percentage,
  mode,
  enabled = true,
  chainId,
  marketAbi,
  marketId,
  tickLower,
  tickUpper,
}: ModifyLiquidityQuoterProps): ModifyQuoteResult {
  const [error, setError] = useState<Error | null>(null);
  const [quoteResult, setQuoteResult] = useState<{
    amount0: bigint;
    amount1: bigint;
    collateralAmount: bigint;
    newLiquidity: bigint;
    liquidityDelta: bigint;
  }>({
    amount0: BigInt(0),
    amount1: BigInt(0),
    collateralAmount: BigInt(0),
    newLiquidity: BigInt(0),
    liquidityDelta: BigInt(0),
  });

  // Make sure the percentage is valid
  const validPercentage = percentage > 0 && percentage <= 100;

  // Calculate the liquidity change amount (delta)
  const liquidityDelta = validPercentage
    ? (currentLiquidity * BigInt(percentage)) / BigInt(100)
    : BigInt(0);

  // Calculate new total liquidity based on mode (add or remove)
  const newLiquidity =
    mode === 'add'
      ? currentLiquidity + liquidityDelta
      : currentLiquidity - liquidityDelta;

  // Use the shared hook to fetch the current sqrt price
  const {
    sqrtPriceX96: currentSqrtPrice,
    loading: isCurrentPoolPriceLoading,
    error: sqrtPriceError,
  } = useSqrtPriceX96({
    marketAddress,
    marketId,
    enabled: enabled && !!marketAddress,
    chainId,
    marketAbi,
  });

  // Convert ticks to sqrtPriceX96 values
  const sqrtPriceAX96 =
    tickLower !== undefined && tickLower !== null
      ? BigInt(TickMath.getSqrtRatioAtTick(tickLower).toString())
      : BigInt(0);

  const sqrtPriceBX96 =
    tickUpper !== undefined && tickUpper !== null
      ? BigInt(TickMath.getSqrtRatioAtTick(tickUpper).toString())
      : BigInt(0);

  // If we're modifying by 0%, or the input data isn't valid, skip the queries
  const shouldQuery =
    enabled &&
    !!marketAddress &&
    !!positionId &&
    currentLiquidity > BigInt(0) &&
    validPercentage &&
    liquidityDelta > BigInt(0) &&
    // When removing 100%, newLiquidity will be 0, but we still need to fetch the quote
    (mode === 'add' || newLiquidity > BigInt(0) || percentage === 100) &&
    currentSqrtPrice > BigInt(0) &&
    sqrtPriceAX96 > BigInt(0) &&
    sqrtPriceBX96 > BigInt(0);

  // Get token amounts for the modification based on the liquidity delta
  const {
    data: tokenAmounts,
    isLoading: isTokensLoading,
    isError: isTokensError,
    error: tokenErrorData,
  } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'getTokensFromLiquidity',
    args: [
      BigInt(liquidityDelta),
      currentSqrtPrice,
      sqrtPriceAX96,
      sqrtPriceBX96,
    ],
    chainId,
    query: {
      enabled: shouldQuery,
    },
  });

  // Get the required collateral for the new position (for both add/remove)
  const {
    data: requiredCollateral,
    isLoading: isCollateralLoading,
    isError: isCollateralError,
    error: collateralErrorData,
  } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteRequiredCollateral',
    args: [positionId, newLiquidity],
    chainId,
    query: {
      enabled: shouldQuery,
    },
  });

  // Update the quote result when data changes
  useEffect(() => {
    if (tokenAmounts && requiredCollateral) {
      // When removing 100%, handle special case
      if (mode === 'remove' && percentage === 100) {
        setQuoteResult({
          amount0: (tokenAmounts as any[])[0] || BigInt(0),
          amount1: (tokenAmounts as any[])[1] || BigInt(0),
          collateralAmount: BigInt(0), // Collateral becomes 0 on complete removal
          newLiquidity: BigInt(0), // New liquidity becomes 0
          liquidityDelta,
        });
      } else {
        setQuoteResult({
          amount0: (tokenAmounts as any[])[0] || BigInt(0),
          amount1: (tokenAmounts as any[])[1] || BigInt(0),
          collateralAmount: requiredCollateral as bigint,
          newLiquidity,
          liquidityDelta,
        });
      }
      setError(null);
    }
  }, [
    tokenAmounts,
    requiredCollateral,
    newLiquidity,
    liquidityDelta,
    mode,
    percentage,
  ]);

  // Handle errors
  useEffect(() => {
    if (sqrtPriceError) {
      setError(sqrtPriceError);
    } else if (isTokensError) {
      setError(
        new Error(tokenErrorData?.message || 'Failed to fetch token amounts')
      );
    } else if (isCollateralError) {
      setError(
        new Error(
          collateralErrorData?.message ||
            'Failed to fetch collateral requirements'
        )
      );
    }
  }, [
    sqrtPriceError,
    isTokensError,
    tokenErrorData,
    isCollateralError,
    collateralErrorData,
  ]);

  return {
    ...quoteResult,
    loading:
      isCurrentPoolPriceLoading || isTokensLoading || isCollateralLoading,
    error,
  };
}
