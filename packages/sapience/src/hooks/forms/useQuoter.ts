import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { parseUnits } from 'viem';
import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';
import { useSettings } from '~/lib/context/SettingsContext';
import { fetchQuoteByUrl, toQuoteUrl } from '~/hooks/forms/quoteApi';

// Define type for quoter response data
export interface QuoteData {
  direction: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  expectedPrice: string; // Decimal string
  collateralAvailable: string; // BigInt string
}

interface UseQuoterProps {
  marketData: MarketGroupType;
  marketId: number;
  expectedPrice: number;
  wagerAmount: string;
}

// External function to generate quote query key
export function generateQuoteQueryKey(
  chainId: number | undefined,
  address: string | undefined,
  marketId: number,
  expectedPrice: number,
  parsedWagerAmount: bigint | null
) {
  // Normalize expectedPrice for stable cache keys (avoid float precision issues)
  const expectedPriceKey = Number.isFinite(expectedPrice)
    ? Number(expectedPrice).toFixed(8)
    : String(expectedPrice);
  return [
    'quote',
    chainId,
    address,
    marketId,
    expectedPriceKey,
    parsedWagerAmount?.toString(),
  ] as const;
}

export function useQuoter({
  marketData,
  marketId,
  expectedPrice,
  wagerAmount,
}: UseQuoterProps) {
  const { quoterBaseUrl, apiBaseUrl: relayerBaseUrl } = useSettings();

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

  // Create stable query key using external function
  const queryKey = useMemo(
    () =>
      generateQuoteQueryKey(
        marketData?.chainId,
        marketData?.address || undefined,
        marketId,
        expectedPrice,
        parsedWagerAmount
      ),
    [
      marketData?.chainId,
      marketData?.address,
      marketId,
      expectedPrice,
      parsedWagerAmount,
    ]
  );

  // Use useQuery to handle fetching, caching, loading states
  const {
    data: quoteData,
    isLoading: isQuoteLoading,
    isFetching: isQuoteFetching,
    error,
  } = useQuery<QuoteData>({
    queryKey,
    queryFn: async () => {
      if (
        !marketData?.chainId ||
        !marketData?.address ||
        !marketId ||
        expectedPrice === undefined ||
        !Number.isFinite(expectedPrice) ||
        !parsedWagerAmount ||
        parsedWagerAmount <= BigInt(0)
      ) {
        throw new Error('Missing required parameters for quote');
      }
      const baseCandidate =
        quoterBaseUrl || relayerBaseUrl || process.env.NEXT_PUBLIC_FOIL_API_URL;
      const apiUrl = toQuoteUrl({
        baseCandidate,
        marketData,
        marketId,
        expectedPrice,
        collateralAvailable: parsedWagerAmount,
      });
      const data = await fetchQuoteByUrl(apiUrl);
      return data as QuoteData;
    },
    // Only enable the query if all required parameters are present and wager amount is valid
    enabled:
      !!marketData?.chainId &&
      !!marketData?.address &&
      !!marketId &&
      expectedPrice !== undefined &&
      Number.isFinite(expectedPrice) &&
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
  const getQuoteErrorMessage = (err: Error | null): string | null => {
    if (!err) {
      return null;
    }
    if (err instanceof Error) {
      if (
        err.message ===
        'Could not find a valid position size that satisfies the price constraints'
      ) {
        return 'The market cannot accept this wager due to insufficient liquidity.';
      }
      return err.message;
    }
    return 'Failed to fetch quote';
  };

  const quoteError = getQuoteErrorMessage(error);

  // Expose loading as true both for initial load and refetches
  const combinedLoading = Boolean(isQuoteLoading || isQuoteFetching);

  return { quoteData, isQuoteLoading: combinedLoading, quoteError };
}
