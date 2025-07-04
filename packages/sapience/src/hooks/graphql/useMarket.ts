import { gql } from '@apollo/client';
import type { Market as MarketType } from '@sapience/ui/types/graphql';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import { foilApi } from '~/lib/utils/util';

const MARKET_QUERY = gql`
  query GetMarketData($chainId: Int!, $address: String!, $marketId: Int!) {
    markets(chainId: $chainId, marketAddress: $address, marketId: $marketId) {
      id
      marketId
      question
      startTimestamp
      endTimestamp
      settled
      poolAddress
      baseAssetMinPriceTick
      baseAssetMaxPriceTick
      optionName
      rules
      marketGroup {
        id
        address
        chainId
        question
        baseTokenName
        quoteTokenName
        collateralAsset
        resource {
          slug
        }
        markets {
          id
          marketId
          question
          endTimestamp
          optionName
        }
      }
    }
  }
`;

// Helper function to format and set the question
const formatQuestion = (rawQuestion: string | undefined | null): string => {
  if (!rawQuestion) {
    return 'Market question not available';
  }
  // Format the question - ensure it has proper capitalization and ends with a question mark
  let formattedQuestion = rawQuestion.trim();

  // Capitalize first letter if it's not already capitalized
  if (formattedQuestion.length > 0 && !/^[A-Z]/.test(formattedQuestion)) {
    formattedQuestion =
      formattedQuestion.charAt(0).toUpperCase() + formattedQuestion.slice(1);
  }

  // Add question mark if missing
  if (!formattedQuestion.endsWith('?')) {
    formattedQuestion += '?';
  }

  return formattedQuestion;
};

interface UseMarketProps {
  chainId: number;
  marketAddress: string;
  marketId: string;
}

export const useMarket = ({
  chainId,
  marketAddress,
  marketId,
}: UseMarketProps) => {
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');
  const [marketQuestionDisplay, setMarketQuestionDisplay] = useState<
    string | null
  >(null);

  const numericMarketId = Number(marketId);

  const { data: marketData, isLoading: isLoadingMarket } =
    useQuery<MarketType | null>({
      queryKey: ['market', chainId, marketAddress, numericMarketId],
      queryFn: async () => {
        if (!chainId || !numericMarketId || !marketAddress) {
          // Returning null or a specific error state might be better than placeholder
          return null; // Changed from { placeholder: true }
        }

        try {
          const response = await foilApi.post('/graphql', {
            query: print(MARKET_QUERY),
            variables: {
              chainId,
              address: marketAddress,
              marketId: numericMarketId,
            },
          });

          // The response structure might return an array or a single object depending on the query
          // Adapting based on the provided query which filters by marketId server-side
          const marketsData = response.data?.markets; // Corrected access path

          if (!marketsData) {
            console.error('No market data in response:', response.data);
            return null;
          }

          // Assuming the query correctly returns only the specific market when marketId is provided
          // If it still returns an array, you might need to find the market like before:
          // const targetMarket = Array.isArray(marketsData) ? marketsData.find(...) : marketsData;
          // For now, assuming the API returns the single expected market object or null/empty array
          if (Array.isArray(marketsData) && marketsData.length === 0) {
            console.error(
              `Market with ID ${numericMarketId} not found in response:`,
              marketsData
            );
            return null;
          }

          const targetMarket = Array.isArray(marketsData)
            ? marketsData[0]
            : marketsData;

          if (!targetMarket) {
            console.error(
              `Market data structure unexpected or empty for ID ${numericMarketId}:`,
              marketsData
            );
            return null;
          }

          return targetMarket as MarketType;
        } catch (error) {
          console.error('Error fetching market:', error);
          // Propagate error state or return null
          return null; // Consider returning an error object
        }
      },
      enabled: !!chainId && !!numericMarketId && !!marketAddress,
      retry: 3,
      retryDelay: 1000,
    });

  // Process and format the question
  useEffect(() => {
    if (isLoadingMarket) {
      setDisplayQuestion('Loading question...');
      setMarketQuestionDisplay(null);
      return;
    }

    if (!marketData) {
      setDisplayQuestion('Market data not available.');
      setMarketQuestionDisplay(null);
      return;
    }

    const marketGroupQuestion = marketData?.marketGroup?.question;
    const marketSpecificQuestion = marketData?.question;

    // Set Market Group Question as the context question if available
    if (marketGroupQuestion) {
      setMarketQuestionDisplay(formatQuestion(marketGroupQuestion));
    } else {
      setMarketQuestionDisplay(null);
    }

    // Determine the main display question
    const mainQuestionSource = marketSpecificQuestion || marketGroupQuestion;
    const formattedMainQuestion = formatQuestion(mainQuestionSource);
    setDisplayQuestion(formattedMainQuestion);
  }, [marketData, isLoadingMarket]);

  return {
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress,
    numericMarketId,
  };
};
