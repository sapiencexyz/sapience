import type { MarketGroupType } from '@foil/ui/types/graphql';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { parseUnits } from 'viem';

// Define type for quoter response data
export interface QuoteData {
  direction: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  currentPrice: string; // Decimal string
  expectedPrice: string; // Decimal string
  collateralAvailable: string; // BigInt string
}

interface UseQuoterProps {
  marketData: MarketGroupType;
  marketId: number;
  expectedPrice: number;
  wagerAmount: string;
}

export function useQuoter({
  marketData,
  marketId,
  expectedPrice,
  wagerAmount,
}: UseQuoterProps) {
  const queryClient = useQueryClient();
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Parse the wager amount to bigint if valid
  const parsedWagerAmount = useMemo(() => {
    try {
      if (!wagerAmount || Number(wagerAmount) <= 0) return null;
      return parseUnits(wagerAmount as `${number}`, 18); // Assuming 18 decimals for sUSDS
    } catch (error) {
      console.error('Error parsing wager amount:', error);
      return null;
    }
  }, [wagerAmount]);

  // Create stable query key
  const queryKey = useMemo(
    () => [
      'quote',
      marketData?.chainId,
      marketData?.address,
      marketId,
      expectedPrice,
      parsedWagerAmount?.toString(),
    ],
    [
      marketData?.chainId,
      marketData?.address,
      marketId,
      expectedPrice,
      parsedWagerAmount,
    ]
  );

  // Use effect for debouncing
  useEffect(() => {
    // If any of the parameters change, clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Only set up debounce and invalidate query if we have valid parameters
    if (
      marketData?.chainId &&
      marketData?.address &&
      marketId &&
      expectedPrice !== undefined &&
      parsedWagerAmount &&
      parsedWagerAmount > BigInt(0)
    ) {
      // Set a timeout to invalidate the query after a delay (debounce)
      debounceTimeout.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 500); // 500ms debounce
    }

    // Clean up on unmount or when dependencies change
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [
    queryKey,
    queryClient,
    marketData?.chainId,
    marketData?.address,
    marketId,
    expectedPrice,
    parsedWagerAmount,
  ]);

  // Use useQuery to handle fetching, caching, loading states
  const {
    data: quoteData,
    isLoading: isQuoteLoading,
    error,
  } = useQuery<QuoteData>({
    queryKey,
    queryFn: async () => {
      if (
        !marketData?.chainId ||
        !marketData?.address ||
        !marketId ||
        expectedPrice === undefined ||
        !parsedWagerAmount ||
        parsedWagerAmount <= BigInt(0)
      ) {
        throw new Error('Missing required parameters for quote');
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL;
      if (!apiBaseUrl) {
        throw new Error('API URL not configured.');
      }

      const apiUrl = `${apiBaseUrl}/quoter/${marketData.chainId}/${marketData.address}/${marketId}/?expectedPrice=${expectedPrice}&collateralAvailable=${parsedWagerAmount.toString()}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data as QuoteData;
    },
    // Only enable the query if all required parameters are present and wager amount is valid
    enabled:
      !!marketData?.chainId &&
      !!marketData?.address &&
      !!marketId &&
      expectedPrice !== undefined &&
      !!parsedWagerAmount &&
      parsedWagerAmount > BigInt(0),
    // Add reasonable refetch settings
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds
    retry: 1,
    refetchInterval: false,
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });

  // Format the error message if there is an error
  const quoteError = error
    ? error instanceof Error
      ? error.message ===
        'Could not find a valid position size that satisfies the price constraints'
        ? 'The market cannot accept this wager due to insufficient liquidity.'
        : error.message
      : 'Failed to fetch quote'
    : null;

  return { quoteData, isQuoteLoading, quoteError };
}
