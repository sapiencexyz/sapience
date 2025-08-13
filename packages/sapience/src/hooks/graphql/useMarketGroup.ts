import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type {
  MarketGroup as MarketGroupType,
  Market as MarketType,
} from '@sapience/ui/types/graphql';
import { getMarketGroupClassification } from '../../lib/utils/marketUtils';
import {
  findActiveMarkets,
  getChainIdFromShortName,
} from '../../lib/utils/util';

// GraphQL query to fetch market data
const MARKET_GROUP_QUERY = /* GraphQL */ `
  query MarketGroup($where: MarketGroupWhereUniqueInput!) {
    marketGroup(where: $where) {
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

// Shared configuration for market group queries
export const marketGroupQueryConfig = {
  queryKey: (chainId: number, marketAddress: string) =>
    ['marketGroup', chainId, marketAddress] as const,

  queryFn: async (
    chainId: number,
    marketAddress: string
  ): Promise<MarketGroupType> => {
    type MarketGroupQueryResult = {
      marketGroup: MarketGroupType;
    };

    const data = await graphqlRequest<MarketGroupQueryResult>(
      MARKET_GROUP_QUERY,
      {
        where: {
          address_chainId: {
            address: marketAddress,
            chainId,
          },
        },
      }
    );

    const marketResponse = data?.marketGroup;

    if (!marketResponse) {
      throw new Error('No market group data in response');
    }
    return marketResponse;
  },
};

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: {
  chainShortName: string;
  marketAddress: string;
}) => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [activeMarkets, setActiveMarkets] = useState<MarketType[]>([]);

  const {
    data: marketGroupData,
    isLoading,
    isSuccess,
    isError,
  } = useQuery<MarketGroupType>({
    queryKey: marketGroupQueryConfig.queryKey(chainId, marketAddress),
    queryFn: () => marketGroupQueryConfig.queryFn(chainId, marketAddress),
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

// Cache utilities for market group data
export function getMarketGroupFromCache(
  queryClient: QueryClient,
  chainId: number,
  marketAddress: string
): MarketGroupType | undefined {
  const queryKey = marketGroupQueryConfig.queryKey(chainId, marketAddress);
  return queryClient.getQueryData(queryKey);
}

export async function prefetchMarketGroup(
  queryClient: QueryClient,
  chainId: number,
  marketAddress: string
): Promise<MarketGroupType | null> {
  const queryKey = marketGroupQueryConfig.queryKey(chainId, marketAddress);

  const existingData = queryClient.getQueryData<MarketGroupType>(queryKey);
  if (existingData) {
    return existingData;
  }

  const marketData = await marketGroupQueryConfig.queryFn(
    chainId,
    marketAddress
  );
  queryClient.setQueryData(queryKey, marketData);

  return marketData;
}
