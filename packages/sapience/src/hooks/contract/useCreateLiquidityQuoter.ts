import { TickMath } from '@uniswap/v3-sdk';
import type { Abi } from 'abitype';
import { useEffect, useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';

import { useSqrtPriceX96 } from './useSqrtPriceX96';

interface QuoteResult {
  amount0: bigint;
  amount1: bigint;
  loading: boolean;
  error: Error | null;
}

interface CreateLiquidityQuoterProps {
  marketAddress?: `0x${string}`;
  collateralAmount: string;
  lowTick: number | null;
  highTick: number | null;
  enabled?: boolean;
  chainId?: number;
  marketAbi: Abi;
  marketId: bigint;
  tickSpacing?: number;
}

// Type for the quoteLiquidityPositionTokens return value
type QuoteLiquidityResult = readonly [bigint, bigint, bigint];

/**
 * Hook to fetch liquidity position quotes from the contract for creating a new position
 */
export function useCreateLiquidityQuoter({
  marketAddress,
  collateralAmount,
  lowTick,
  highTick,
  enabled = true,
  chainId,
  marketAbi,
  marketId,
}: CreateLiquidityQuoterProps): QuoteResult {
  const [error, setError] = useState<Error | null>(null);
  const [quoteResult, setQuoteResult] = useState<{
    amount0: bigint;
    amount1: bigint;
  }>({
    amount0: BigInt(0),
    amount1: BigInt(0),
  });

  // Parse and validate inputs
  const collateralAmountNumber = parseFloat(collateralAmount);
  const isValidCollateral =
    !Number.isNaN(collateralAmountNumber) && collateralAmountNumber > 0;

  // Convert price inputs to ticks and then to sqrt ratios
  const { sqrtPriceAX96, sqrtPriceBX96 } = useMemo(() => {
    // Use TickMath to get the exact sqrtRatio values that Uniswap uses
    const safetyLowTick = lowTick === null ? 0 : lowTick;
    const safetyHighTick = highTick === null ? 0 : highTick;

    const lowSqrtRatio = BigInt(
      TickMath.getSqrtRatioAtTick(safetyLowTick).toString()
    );
    const highSqrtRatio = BigInt(
      TickMath.getSqrtRatioAtTick(safetyHighTick).toString()
    );

    return {
      sqrtPriceAX96: lowSqrtRatio,
      sqrtPriceBX96: highSqrtRatio,
    };
  }, [lowTick, highTick]);

  // Check if all inputs are valid
  const inputsAreValid =
    isValidCollateral && sqrtPriceAX96 > BigInt(0) && sqrtPriceBX96 > BigInt(0);

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

  // Prepare collateral amount with proper scaling (assuming 18 decimals)
  const depositedCollateralAmount = isValidCollateral
    ? BigInt(Math.floor(collateralAmountNumber * 1e18))
    : BigInt(0);

  // Fetch the quote from the contract
  const {
    data: quoteData,
    isLoading: isQuoteLoading,
    isError: isQuoteError,
    error: quoteErrorData,
  } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteLiquidityPositionTokens',
    args: [
      BigInt(marketId),
      depositedCollateralAmount,
      currentSqrtPrice,
      sqrtPriceAX96, // Use converted sqrt price
      sqrtPriceBX96, // Use converted sqrt price
    ],
    chainId,
    query: {
      enabled:
        enabled &&
        !!currentSqrtPrice &&
        currentSqrtPrice > BigInt(0) &&
        inputsAreValid,
    },
  });

  // Update the quote result when data changes
  useEffect(() => {
    if (quoteData) {
      // Safely cast quoteData to the expected type
      const typedQuoteData = quoteData as QuoteLiquidityResult;
      setQuoteResult({
        amount0: typedQuoteData[0] || BigInt(0),
        amount1: typedQuoteData[1] || BigInt(0),
      });
      setError(null);
    }
  }, [quoteData]);

  // Handle errors
  useEffect(() => {
    if (sqrtPriceError) {
      setError(sqrtPriceError);
    } else if (isQuoteError) {
      setError(new Error(quoteErrorData?.message || 'Failed to fetch quote'));
    }
  }, [sqrtPriceError, isQuoteError, quoteErrorData]);

  return {
    ...quoteResult,
    loading: isCurrentPoolPriceLoading || isQuoteLoading,
    error,
  };
}

// For backward compatibility
export { useCreateLiquidityQuoter as useLiquidityQuoter };
