'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export type SecondaryTrade = {
  id: number;
  tradeHash: string;
  chainId: number;
  token: string;
  collateral: string;
  seller: string;
  buyer: string;
  tokenAmount: string;
  price: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
};

const SECONDARY_TRADES_BY_ADDRESS_QUERY = /* GraphQL */ `
  query SecondaryTradesByAddress(
    $address: String!
    $chainId: Int
    $take: Int
    $skip: Int
  ) {
    secondaryTradesByAddress(
      address: $address
      chainId: $chainId
      take: $take
      skip: $skip
    ) {
      id
      tradeHash
      chainId
      token
      collateral
      seller
      buyer
      tokenAmount
      price
      transactionHash
      blockNumber
      timestamp
    }
  }
`;

const SECONDARY_TRADE_QUERY = /* GraphQL */ `
  query SecondaryTrade($tradeHash: String!) {
    secondaryTrade(tradeHash: $tradeHash) {
      id
      tradeHash
      chainId
      token
      collateral
      seller
      buyer
      tokenAmount
      price
      transactionHash
      blockNumber
      timestamp
    }
  }
`;

export function useSecondaryTradesByAddress(params: {
  address?: string;
  chainId?: number;
  take?: number;
  skip?: number;
}) {
  const { address, chainId, take = 50, skip = 0 } = params;
  const enabled = Boolean(address);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTrades', address, chainId, take, skip],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        secondaryTradesByAddress: SecondaryTrade[];
      }>(SECONDARY_TRADES_BY_ADDRESS_QUERY, {
        address,
        chainId: chainId ?? null,
        take,
        skip,
      });
      return resp?.secondaryTradesByAddress ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}

export function useSecondaryTrade(tradeHash?: string) {
  const enabled = Boolean(tradeHash);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTrade', tradeHash],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        secondaryTrade: SecondaryTrade | null;
      }>(SECONDARY_TRADE_QUERY, { tradeHash });
      return resp?.secondaryTrade ?? null;
    },
  });

  return {
    data: data ?? null,
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
