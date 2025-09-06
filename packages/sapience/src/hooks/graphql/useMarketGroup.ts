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

// By address (unique)
const MARKET_GROUP_BY_ADDRESS_QUERY = /* GraphQL */ `
  query MarketGroupByAddress($where: MarketGroupWhereUniqueInput!) {
    marketGroup(where: $where) {
      id
      address
      chainId
      question
      rules
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
        poolAddress
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
      }
    }
  }
`;

// By ID (unique)
const MARKET_GROUP_BY_ID_QUERY = /* GraphQL */ `
  query MarketGroupById($id: Int!) {
    marketGroup(where: { id: $id }) {
      id
      address
      chainId
      question
      rules
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
        poolAddress
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
      }
    }
  }
`;

// By Nonce (not guaranteed unique in schema -> use findFirst with chainId)
const MARKET_GROUP_BY_NONCE_QUERY = /* GraphQL */ `
  query MarketGroupByNonce($chainId: Int!, $nonce: String!) {
    findFirstMarketGroup(
      where: {
        chainId: { equals: $chainId }
        initializationNonce: { equals: $nonce }
      }
    ) {
      id
      address
      chainId
      question
      rules
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
        poolAddress
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
      }
    }
  }
`;

// Normalize any market group identifier to a stable cache key segment
export function normalizeMarketIdentifier(marketIdentifier: string): string {
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  const mgIdMatch = /^mg-(\d+)$/i.exec(marketIdentifier || '');
  const nonceMatch = /^(?:nonce-)?(\d+)$/i.exec(marketIdentifier || '');

  const isAddress = addressRegex.test(marketIdentifier || '');
  const mgId = mgIdMatch ? parseInt(mgIdMatch[1], 10) : null;
  const nonce = !isAddress && !mgIdMatch && nonceMatch ? nonceMatch[1] : null;

  return isAddress
    ? `addr:${marketIdentifier}`
    : mgId !== null
      ? `mg:${mgId}`
      : nonce !== null
        ? `nonce:${nonce}`
        : marketIdentifier;
}

// Shared configuration for market group queries
export const marketGroupQueryConfig = {
  queryKey: (normalizedIdentifier: string, chainId: number) =>
    ['marketGroup', normalizedIdentifier, chainId] as const,
};

async function fetchMarketGroup(
  marketIdentifier: string,
  chainId: number
): Promise<MarketGroupType> {
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  const mgIdMatch = /^mg-(\d+)$/i.exec(marketIdentifier || '');
  const nonceMatch = /^(?:nonce-)?(\d+)$/i.exec(marketIdentifier || '');

  const isAddress = addressRegex.test(marketIdentifier || '');
  const mgId = mgIdMatch ? parseInt(mgIdMatch[1], 10) : null;
  const nonce = !isAddress && !mgIdMatch && nonceMatch ? nonceMatch[1] : null;

  // Address path (backward compatible)
  if (isAddress) {
    type Res = { marketGroup: MarketGroupType };
    const data = await graphqlRequest<Res>(MARKET_GROUP_BY_ADDRESS_QUERY, {
      where: {
        address_chainId: {
          address: marketIdentifier,
          chainId,
        },
      },
    });
    const res = data?.marketGroup;
    if (!res) throw new Error('No market group data in response');
    return res;
  }

  // mg-<id>
  if (mgId !== null) {
    type Res = { marketGroup: MarketGroupType };
    const data = await graphqlRequest<Res>(MARKET_GROUP_BY_ID_QUERY, {
      id: mgId,
    });
    const res = data?.marketGroup;
    if (!res) throw new Error('No market group data in response');
    return res;
  }

  // nonce-<n> or bare <n>
  if (nonce !== null) {
    type Res = { findFirstMarketGroup: MarketGroupType };
    const data = await graphqlRequest<Res>(MARKET_GROUP_BY_NONCE_QUERY, {
      chainId,
      nonce,
    });
    const res = data?.findFirstMarketGroup;
    if (!res) throw new Error('No market group data in response');
    return res;
  }

  throw new Error('Invalid market identifier');
}

export const useMarketGroup = ({
  chainShortName,
  marketAddress,
}: {
  chainShortName: string;
  marketAddress: string;
}) => {
  const chainId = getChainIdFromShortName(chainShortName);
  const [activeMarkets, setActiveMarkets] = useState<MarketType[]>([]);

  // Determine identifier type
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  const mgIdMatch = /^mg-(\d+)$/i.exec(marketAddress || '');
  const nonceMatch = /^(?:nonce-)?(\d+)$/i.exec(marketAddress || '');

  const isAddress = addressRegex.test(marketAddress || '');
  const mgId = mgIdMatch ? parseInt(mgIdMatch[1], 10) : null;
  const nonce = !isAddress && !mgIdMatch && nonceMatch ? nonceMatch[1] : null;

  const identifierKey = isAddress
    ? `addr:${marketAddress}`
    : mgId !== null
      ? `mg:${mgId}`
      : nonce !== null
        ? `nonce:${nonce}`
        : marketAddress;

  const {
    data: marketGroupData,
    isLoading,
    isSuccess,
    isError,
  } = useQuery<MarketGroupType>({
    queryKey: marketGroupQueryConfig.queryKey(identifierKey, chainId),
    queryFn: async () => fetchMarketGroup(marketAddress, chainId),
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
  const normalized = normalizeMarketIdentifier(marketAddress);
  const queryKey = marketGroupQueryConfig.queryKey(normalized, chainId);
  return queryClient.getQueryData(queryKey);
}

export async function prefetchMarketGroup(
  queryClient: QueryClient,
  chainId: number,
  marketAddress: string
): Promise<MarketGroupType | null> {
  const normalized = normalizeMarketIdentifier(marketAddress);
  const queryKey = marketGroupQueryConfig.queryKey(normalized, chainId);

  // If we already have data, return it immediately
  const existingData = queryClient.getQueryData<MarketGroupType>(queryKey);
  if (existingData) {
    return existingData;
  }

  // Use React Query's prefetch so fetching state is tracked properly
  try {
    await queryClient.prefetchQuery({
      queryKey,
      queryFn: () => fetchMarketGroup(marketAddress, chainId),
    });
  } catch {
    // Swallow errors here; callers can inspect query state for error
  }

  return queryClient.getQueryData<MarketGroupType>(queryKey) ?? null;
}
