import { gql } from '@apollo/client';
import type { MarketType } from '@foil/ui/types';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import type { Market, MarketGroup } from '../../lib/interfaces';
import {
  findActiveMarkets,
  foilApi,
  getChainIdFromShortName,
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
      markets {
        optionName
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
  marketGroupData: MarketGroup;
  isLoading: boolean;
  isSuccess: boolean;
  activeMarkets: Market[];
  chainId: number;
  isError: boolean;
  marketType: MarketType;
}

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: UseMarketGroupProps): UseMarketGroupReturn => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [activeMarkets, setActiveMarkets] = useState<Market[]>([]);
  const [marketType, setMarketType] = useState<MarketType>(MarketType.NUMERIC);
  const {
    data: marketGroupData,
    isLoading,
    isSuccess,
    isError,
  } = useQuery<MarketGroup>({
    // Type assertion needed for placeholder
    queryKey: ['marketGroup', chainId, marketAddress],
    queryFn: async () => {
      const response = await foilApi.post('/graphql', {
        query: print(MARKET_GROUP_QUERY),
        variables: { chainId, address: marketAddress },
      });
      const marketResponse = response.data?.marketGroup;

      if (!marketResponse) {
        throw new Error('No market group data in response');
      }
      return marketResponse as MarketGroup; // Use imported MarketGroup type
    },
    enabled: !!chainId && !!marketAddress && chainId !== 0,
    retry: 3,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (marketGroupData) {
      const activeMarkets = findActiveMarkets(marketGroupData);
      setActiveMarkets(activeMarkets);

      if (activeMarkets.length > 1) {
        setMarketType(MarketType.SINGLE_CHOICE);
      } else if (marketGroupData.baseTokenName === 'Yes') {
        setMarketType(MarketType.YES_NO);
      } else {
        setMarketType(MarketType.NUMERIC);
      }
    }
  }, [marketGroupData]);

  return {
    marketGroupData: marketGroupData as MarketGroup,
    isLoading,
    isSuccess,
    activeMarkets,
    chainId,
    isError,
    marketType,
  };
};
