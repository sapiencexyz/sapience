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
  txHash: string;
  blockNumber: number;
  executedAt: number;
};

const TRADES_BY_SELLER_QUERY = /* GraphQL */ `
  query TradesBySeller(
    $seller: String!
    $chainId: Int
    $take: Int
    $skip: Int
  ) {
    trades(seller: $seller, chainId: $chainId, take: $take, skip: $skip) {
      id
      tradeHash
      chainId
      token
      collateral
      seller
      buyer
      tokenAmount
      price
      txHash
      blockNumber
      executedAt
    }
  }
`;

const TRADES_BY_BUYER_QUERY = /* GraphQL */ `
  query TradesByBuyer($buyer: String!, $chainId: Int, $take: Int, $skip: Int) {
    trades(buyer: $buyer, chainId: $chainId, take: $take, skip: $skip) {
      id
      tradeHash
      chainId
      token
      collateral
      seller
      buyer
      tokenAmount
      price
      txHash
      blockNumber
      executedAt
    }
  }
`;

const TRADE_QUERY = /* GraphQL */ `
  query Trade($id: String!) {
    trade(id: $id) {
      id
      tradeHash
      chainId
      token
      collateral
      seller
      buyer
      tokenAmount
      price
      txHash
      blockNumber
      executedAt
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
      const [sellResp, buyResp] = await Promise.all([
        graphqlRequest<{ trades: SecondaryTrade[] }>(TRADES_BY_SELLER_QUERY, {
          seller: address,
          chainId: chainId ?? null,
          take,
          skip,
        }),
        graphqlRequest<{ trades: SecondaryTrade[] }>(TRADES_BY_BUYER_QUERY, {
          buyer: address,
          chainId: chainId ?? null,
          take,
          skip,
        }),
      ]);
      const seen = new Set<number>();
      const merged: SecondaryTrade[] = [];
      for (const t of [
        ...(sellResp?.trades ?? []),
        ...(buyResp?.trades ?? []),
      ]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
      return merged.sort((a, b) => b.executedAt - a.executedAt);
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
        trade: SecondaryTrade | null;
      }>(TRADE_QUERY, { id: tradeHash });
      return resp?.trade ?? null;
    },
  });

  return {
    data: data ?? null,
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
