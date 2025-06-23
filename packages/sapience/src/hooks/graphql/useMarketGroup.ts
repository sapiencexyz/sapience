import { gql } from '@apollo/client';
import type { MarketGroup as MarketGroupType, Market as MarketType } from '@foil/ui/types/graphql';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

import type { MarketGroupClassification } from '../../lib/types';
import { getMarketGroupClassification } from '../../lib/utils/marketUtils';
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
      collateralSymbol
      collateralAsset
      markets {
        optionName
        id
        marketId
        question
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
      }
    }
  }
`;

interface UseMarketGroupProps {
  chainShortName: string;
  marketAddress: string;
}

interface UseMarketGroupReturn {
  marketGroupData: MarketGroupType | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  activeMarkets: MarketType[];
  chainId: number;
  isError: boolean;
  marketClassification: MarketGroupClassification | undefined;
}

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: UseMarketGroupProps): UseMarketGroupReturn => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [activeMarkets, setActiveMarkets] = useState<MarketType[]>([]);

  const {
    data: marketGroupData,
    isLoading,
    isSuccess,
    isError,
  } = useQuery<MarketGroupType>({
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
      return marketResponse;
    },
    enabled: !!chainId && !!marketAddress && chainId !== 0,
    retry: 3,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (marketGroupData) {
      const newActiveMarkets = findActiveMarkets(marketGroupData);
      setActiveMarkets(newActiveMarkets);
    }
  }, [marketGroupData]);

  const marketClassification = marketGroupData
    ? getMarketGroupClassification(marketGroupData)
    : undefined;

  return {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    chainId,
    isError,
    marketClassification,
  };
};
