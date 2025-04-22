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
  marketAddress: `0x${string}`;
  collateralAmount: string;
  lowPriceInput: string;
  highPriceInput: string;
  epochId?: number;
  enabled?: boolean;
  chainId?: number;
}

// ABI fragments needed for the calls
const marketAbi = [
  {
    inputs: [],
    name: 'getSqrtPriceX96',
    outputs: [{ internalType: 'uint160', name: '', type: 'uint160' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'epochId', type: 'uint256' },
      {
        internalType: 'uint256',
        name: 'depositedCollateralAmount',
        type: 'uint256',
      },
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtPriceAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtPriceBX96', type: 'uint160' },
    ],
    name: 'quoteLiquidityPositionTokens',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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
}: LiquidityQuoterProps): QuoteResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [quoteResult, setQuoteResult] = useState<{
    amount0: bigint;
    amount1: bigint;
    liquidity: bigint;
  }>({
    amount0: BigInt(0),
    amount1: BigInt(0),
    liquidity: BigInt(0),
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
  const { data: currentSqrtPrice, isError: isPriceError } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'getSqrtPriceX96',
    chainId,
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
      currentSqrtPrice || BigInt(0),
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
      setQuoteResult({
        amount0: quoteData[0] || BigInt(0),
        amount1: quoteData[1] || BigInt(0),
        liquidity: quoteData[2] || BigInt(0),
      });
      setError(null);
    }
  }, [quoteData]);

  // Update loading state
  useEffect(() => {
    setLoading(isQuoteLoading);
  }, [isQuoteLoading]);

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
    loading,
    error,
  };
}
