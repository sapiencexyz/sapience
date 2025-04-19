import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import {
  findActiveMarkets,
  getDisplayQuestion,
} from '../lib/utils/questionUtils';
import { foilApi } from '../lib/utils/util';

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

// Utility to get chainId from chain short name
const getChainIdFromShortName = (shortName: string): number => {
  switch (shortName?.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      return 0; // Return 0 or handle error appropriately
  }
};

interface Market {
  id: string;
  marketId: string;
  question?: string;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
}

interface MarketGroupData {
  id: string;
  address: string;
  chainId: number;
  question: string;
  baseTokenName: string;
  quoteTokenName: string;
  optionNames: string[];
  markets: Market[];
  placeholder?: boolean; // Added placeholder property
}

interface UseMarketGroupProps {
  chainShortName: string;
  marketAddress: string;
}

interface UseMarketGroupReturn {
  marketData: MarketGroupData | null | undefined;
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
  } = useQuery<MarketGroupData | { placeholder: true }>({
    // Type assertion needed for placeholder
    queryKey: ['marketGroup', chainId, marketAddress],
    queryFn: async () => {
      if (!chainId || !marketAddress || chainId === 0) {
        console.log('Missing required parameters for query:', {
          chainId,
          marketAddress,
        });
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
        return marketResponse as MarketGroupData; // Type assertion
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
    if (marketData && !marketData.placeholder) {
      const currentlyActiveMarkets = findActiveMarkets(marketData);
      setActiveMarkets(currentlyActiveMarkets);

      if (currentlyActiveMarkets.length > 0) {
        setCurrentMarketId(currentlyActiveMarkets[0].marketId);
      } else {
        setCurrentMarketId(null);
      }
    } else {
      // Reset if data is loading, placeholder, or invalid
      setActiveMarkets([]);
      setCurrentMarketId(null);
    }
  }, [marketData]);

  // Process and format the display question
  useEffect(() => {
    const question = getDisplayQuestion(
      marketData,
      activeMarkets,
      isLoadingMarket,
      'Loading question...'
    );
    setDisplayQuestion(question);
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
