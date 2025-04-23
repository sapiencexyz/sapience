import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { priceToSqrtPriceX96 } from '~/lib/utils/tickUtils';

interface QuoteResult {
  amount0: bigint;
  amount1: bigint;
  loading: boolean;
  error: Error | null;
}

interface LiquidityQuoterProps {
  marketAddress?: `0x${string}`;
  collateralAmount: string;
  lowPriceInput: string;
  highPriceInput: string;
  epochId?: number;
  enabled?: boolean;
  chainId?: number;
  marketAbi: any;
  marketId: bigint;
}

// Type for the quoteLiquidityPositionTokens return value
type QuoteLiquidityResult = readonly [bigint, bigint, bigint];

/**
 * Hook to fetch liquidity position quotes from the contract
 */
export function useLiquidityQuoter({
  marketAddress,
  collateralAmount,
  lowPriceInput,
  highPriceInput,
  epochId = 0,
  enabled = true,
  chainId,
  marketAbi,
  marketId,
}: LiquidityQuoterProps): QuoteResult {
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
    !isNaN(collateralAmountNumber) && collateralAmountNumber > 0;

  const lowPrice = parseFloat(lowPriceInput);
  const highPrice = parseFloat(highPriceInput);
  const arePricesValid =
    !isNaN(lowPrice) && !isNaN(highPrice) && lowPrice < highPrice;

  // Check if all inputs are valid
  const inputsAreValid = isValidCollateral && arePricesValid;

  // Fetch the current sqrt price
  const {
    data: currentSqrtPrice,
    isError: isPriceError,
    isLoading: isCurrentPoolPriceLoading,
    error: currentPoolPriceError,
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

  // Convert prices to sqrt ratios
  const sqrtPriceAX96 = arePricesValid
    ? priceToSqrtPriceX96(lowPrice)
    : BigInt(0);
  const sqrtPriceBX96 = arePricesValid
    ? priceToSqrtPriceX96(highPrice)
    : BigInt(0);

  // Prepare collateral amount with proper scaling (assuming 18 decimals)
  const depositedCollateralAmount = isValidCollateral
    ? BigInt(Math.floor(collateralAmountNumber * 1e18))
    : BigInt(0);

  // Fetch the quote from the contract
  const {
    data: quoteData,
    isLoading: isQuoteLoading,
    isError: isQuoteError,
  } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteLiquidityPositionTokens',
    args: [
      BigInt(epochId),
      depositedCollateralAmount,
      (currentSqrtPrice as bigint) || BigInt(0),
      sqrtPriceAX96,
      sqrtPriceBX96,
    ],
    chainId,
    query: {
      enabled: enabled && !!currentSqrtPrice && inputsAreValid,
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
    if (isPriceError) {
      setError(new Error('Failed to fetch current price'));
    } else if (isQuoteError) {
      setError(new Error('Failed to fetch quote'));
    }
  }, [isPriceError, isQuoteError]);

  return {
    ...quoteResult,
    loading: isCurrentPoolPriceLoading || isQuoteLoading,
    error,
  };
}
