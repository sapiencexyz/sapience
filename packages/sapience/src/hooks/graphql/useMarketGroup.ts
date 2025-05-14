import { gql } from '@apollo/client';
import type { MarketGroupType, MarketType } from '@foil/ui/types';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { useEffect, useState } from 'react';

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

export enum MarketGroupClassification {
  MULTIPLE_CHOICE = '1',
  YES_NO = '2',
  NUMERIC = '3',
}

interface UseMarketGroupReturn {
  marketGroupData: MarketGroupType;
  isLoading: boolean;
  isSuccess: boolean;
  activeMarkets: MarketType[];
  chainId: number;
  isError: boolean;
  marketClassification: MarketGroupClassification;
}

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: UseMarketGroupProps): UseMarketGroupReturn => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [activeMarkets, setActiveMarkets] = useState<MarketType[]>([]);
  const [marketClassification, setMarketClassification] =
    useState<MarketGroupClassification>(MarketGroupClassification.NUMERIC);

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
      return marketResponse; // Use imported MarketGroup type
    },
    enabled: !!chainId && !!marketAddress && chainId !== 0,
    retry: 3,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (marketGroupData) {
      const newActiveMarkets = findActiveMarkets(marketGroupData);
      setActiveMarkets(newActiveMarkets);

      if (marketGroupData.markets.length > 1) {
        setMarketClassification(MarketGroupClassification.MULTIPLE_CHOICE);
      } else if (marketGroupData.markets[0].optionName === null) {
        setMarketClassification(MarketGroupClassification.YES_NO);
      } else {
        setMarketClassification(MarketGroupClassification.NUMERIC);
      }
    }
  }, [marketGroupData]);

  return {
    marketGroupData: marketGroupData as MarketGroupType,
    isLoading,
    isSuccess,
    activeMarkets,
    chainId,
    isError,
    marketClassification,
  };
};
