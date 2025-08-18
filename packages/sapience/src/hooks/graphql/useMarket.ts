import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Market as MarketType } from '@sapience/ui/types/graphql';

const MARKET_QUERY = /* GraphQL */ `
  query MarketData($address: String!, $marketId: Int!) {
    markets(
      where: {
        marketGroup: { is: { address: { equals: $address } } }
        marketId: { equals: $marketId }
      }
    ) {
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
      marketGroup {
        id
        address
        chainId
        question
        rules
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
          return null;
        }

        try {
          type MarketQueryResult = {
            markets: MarketType[];
          };

          const data = await graphqlRequest<MarketQueryResult>(MARKET_QUERY, {
            address: marketAddress,
            marketId: numericMarketId,
          });

          const marketsData = data?.markets;

          if (!marketsData) {
            console.error('No market data in response:', data);
            return null;
          }

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

          return targetMarket;
        } catch (error) {
          console.error('Error fetching market:', error);
          return null;
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
