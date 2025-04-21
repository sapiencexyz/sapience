import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import type { Market, MarketGroup } from '../../lib/interfaces/interfaces';
import {
  findActiveMarkets,
  getDisplayQuestion,
  getChainIdFromShortName,
  foilApi,
} from '../../lib/utils/util';

// GraphQL query to fetch market data
const MARKET_GROUP_QUERY = gql`
  query GetMarketGroup($chainId: Int!, $address: String!) {
    marketGroup(chainId: $chainId, address: $address) {
      id
      address
      chainId
      question
      baseTokenName
      quoteTokenName
      optionNames
      markets {
        id
        marketId
        question
        startTimestamp
        endTimestamp
        settled
      }
    }
  }
`;

interface UseMarketGroupProps {
  chainShortName: string;
  marketAddress: string;
}

interface UseMarketGroupReturn {
  marketData: MarketGroup | null | undefined;
  isLoadingMarket: boolean;
  isSuccess: boolean;
  displayQuestion: string;
  currentMarketId: string | null;
  activeMarkets: Market[];
  chainId: number;
}

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: UseMarketGroupProps): UseMarketGroupReturn => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');
  const [currentMarketId, setCurrentMarketId] = useState<string | null>(null);
  const [activeMarkets, setActiveMarkets] = useState<Market[]>([]);

  const {
    data: marketData,
    isLoading: isLoadingMarket,
    isSuccess,
  } = useQuery<MarketGroup | { placeholder: true }>({
    // Type assertion needed for placeholder
    queryKey: ['marketGroup', chainId, marketAddress],
    queryFn: async () => {
      if (!chainId || !marketAddress || chainId === 0) {
        return { placeholder: true };
      }

      try {
        const response = await foilApi.post('/graphql', {
          query: print(MARKET_GROUP_QUERY),
          variables: { chainId, address: marketAddress },
        });
        const marketResponse = response.data?.marketGroup;

        if (!marketResponse) {
          console.error('No market group data in response:', response.data);
          return { placeholder: true };
        }
        return marketResponse as MarketGroup; // Use imported MarketGroup type
      } catch (error) {
        console.error('Error fetching market group:', error);
        return { placeholder: true };
      }
    },
    enabled: !!chainId && !!marketAddress && chainId !== 0,
    retry: 3,
    retryDelay: 1000,
  });

  // Process market data to find active markets and set current market ID
  useEffect(() => {
    // Only process if marketData is valid and not a placeholder
    const currentlyActiveMarkets =
      marketData && !marketData.placeholder
        ? findActiveMarkets(marketData)
        : [];
    setActiveMarkets(currentlyActiveMarkets);

    if (currentlyActiveMarkets.length > 0) {
      setCurrentMarketId(currentlyActiveMarkets[0].marketId);
    } else {
      setCurrentMarketId(null);
    }
    // marketData is the dependency
  }, [marketData]);

  // Process and format the display question
  useEffect(() => {
    // Pass valid marketData or null to the utility function
    const dataForQuestion =
      marketData && !marketData.placeholder ? marketData : null;
    const question = getDisplayQuestion(
      dataForQuestion,
      activeMarkets,
      isLoadingMarket,
      'Loading question...'
      // defaultErrorMessage is optional, defaults to 'This market question is not available'
    );
    setDisplayQuestion(question);
    // Dependencies: marketData, activeMarkets, isLoadingMarket
  }, [marketData, isLoadingMarket, activeMarkets]);

  // Ensure marketData returned is not the placeholder
  const finalMarketData =
    marketData && !marketData.placeholder ? marketData : null;

  return {
    marketData: finalMarketData,
    isLoadingMarket,
    isSuccess,
    displayQuestion,
    currentMarketId,
    activeMarkets,
    chainId,
  };
};
