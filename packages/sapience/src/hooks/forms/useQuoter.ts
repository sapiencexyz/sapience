import debounce from 'lodash/debounce';
import { useState, useEffect, useCallback } from 'react';
import { parseUnits } from 'viem';

import type { PredictionMarketType } from '~/components/forecasting/PredictionForm';
import type { ActiveTab } from '~/hooks/forms/usePredictionFormState';

// Define type for quoter response data (matching component usage)
export interface QuoteData {
  direction: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  currentPrice: string; // Decimal string
  expectedPrice: string; // Decimal string
  collateralAvailable: string; // BigInt string
}

interface UseQuoterProps {
  marketData: PredictionMarketType | null | undefined;
  displayMarketId: string | number | null;
  wagerAmount: string;
  expectedPriceForQuoter: number | null;
  activeTab: ActiveTab;
}

export function useQuoter({
  marketData,
  displayMarketId,
  wagerAmount,
  expectedPriceForQuoter,
  activeTab,
}: UseQuoterProps) {
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Debounced fetch function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetchQuote = useCallback(
    debounce(
      async (params: {
        chainId: number;
        marketAddress: string;
        marketId: string;
        expectedPrice: number;
        collateralAvailable: bigint;
      }) => {
        const {
          chainId,
          marketAddress,
          marketId,
          expectedPrice,
          collateralAvailable,
        } = params;

        // Only fetch if collateral amount is positive
        if (collateralAvailable <= BigInt(0)) {
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
          return;
        }

        setIsQuoteLoading(true);
        setQuoteError(null);
        setQuoteData(null); // Clear previous quote data

        try {
          // Construct the URL using the established environment variable pattern
          const apiBaseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL || ''; // Use specific FOIL API URL
          if (!apiBaseUrl) {
            console.warn(
              'NEXT_PUBLIC_FOIL_API_URL is not set. Cannot fetch quote.'
            );
            throw new Error('API URL not configured.');
          }
          const apiUrl = `${apiBaseUrl}/quoter/${chainId}/${marketAddress}/${marketId}/?expectedPrice=${expectedPrice}&collateralAvailable=${collateralAvailable.toString()}`;
          // console.log('Fetching quote from:', apiUrl); // Keep console logs minimal in hooks

          const response = await fetch(apiUrl);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || `HTTP error! status: ${response.status}`
            );
          }

          // console.log('Quote received:', data); // Keep console logs minimal in hooks
          setQuoteData(data as QuoteData);
        } catch (error: unknown) {
          console.error('Error fetching quote:', error);
          let finalErrorMessage = 'Failed to fetch quote'; // Default message
          if (error instanceof Error) {
            finalErrorMessage =
              error.message ===
              'Could not find a valid position size that satisfies the price constraints'
                ? 'The market cannot accept this wager due to insufficient liquidity.'
                : error.message;
          }
          setQuoteError(finalErrorMessage);
          setQuoteData(null); // Clear data on error
        } finally {
          setIsQuoteLoading(false);
        }
      },
      500 // 500ms debounce delay
    ),
    [] // Empty dependency array for useCallback with debounce
  );

  // useEffect to trigger the debounced fetch when relevant inputs change
  useEffect(() => {
    if (
      activeTab === 'wager' &&
      marketData?.chainId &&
      marketData?.address &&
      displayMarketId &&
      expectedPriceForQuoter !== null &&
      wagerAmount
    ) {
      try {
        const collateralAmountBI = parseUnits(
          wagerAmount as `${number}`,
          18 // Assuming 18 decimals for sUSDS
        );

        if (collateralAmountBI > BigInt(0)) {
          debouncedFetchQuote({
            chainId: marketData.chainId,
            marketAddress: marketData.address,
            marketId: displayMarketId.toString(),
            expectedPrice: expectedPriceForQuoter,
            collateralAvailable: collateralAmountBI,
          });
        } else {
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
        }
      } catch (error) {
        console.error('Error parsing wager amount:', error);
        setQuoteData(null);
        setQuoteError('Invalid wager amount entered.');
        setIsQuoteLoading(false);
      }
    } else {
      setQuoteData(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      debouncedFetchQuote.cancel();
    }

    return () => {
      debouncedFetchQuote.cancel();
    };
  }, [
    activeTab,
    marketData?.chainId,
    marketData?.address,
    displayMarketId,
    expectedPriceForQuoter,
    wagerAmount,
    debouncedFetchQuote,
  ]);

  return { quoteData, isQuoteLoading, quoteError };
}
