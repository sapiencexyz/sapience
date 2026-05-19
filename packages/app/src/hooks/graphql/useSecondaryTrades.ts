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
  query TradesBySeller($filter: TradeFilter, $first: Int, $after: String) {
    tradesConnection(filter: $filter, first: $first, after: $after) {
      nodes {
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
  }
`;

const TRADES_BY_BUYER_QUERY = /* GraphQL */ `
  query TradesByBuyer($filter: TradeFilter, $first: Int, $after: String) {
    tradesConnection(filter: $filter, first: $first, after: $after) {
      nodes {
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
  }
`;

const ALL_TRADES_QUERY = /* GraphQL */ `
  query AllTrades($filter: TradeFilter, $first: Int, $after: String) {
    tradesConnection(filter: $filter, first: $first, after: $after) {
      nodes {
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
  }
`;

const TRADE_QUERY = /* GraphQL */ `
  query Trade($tradeHash: String!) {
    tradeByHash(hash: $tradeHash) {
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

const cursorFromSkip = (skip: number): string | null =>
  skip > 0
    ? btoa(JSON.stringify({ k: String(skip - 1), id: String(skip - 1) }))
    : null;

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
        graphqlRequest<{ tradesConnection: { nodes: SecondaryTrade[] } }>(
          TRADES_BY_SELLER_QUERY,
          {
            filter: { seller: address, chainId: chainId ?? null },
            first: take,
            after: cursorFromSkip(skip),
          }
        ),
        graphqlRequest<{ tradesConnection: { nodes: SecondaryTrade[] } }>(
          TRADES_BY_BUYER_QUERY,
          {
            filter: { buyer: address, chainId: chainId ?? null },
            first: take,
            after: cursorFromSkip(skip),
          }
        ),
      ]);
      const seen = new Set<number>();
      const merged: SecondaryTrade[] = [];
      for (const t of [
        ...(sellResp?.tradesConnection?.nodes ?? []),
        ...(buyResp?.tradesConnection?.nodes ?? []),
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
        tradeByHash: SecondaryTrade | null;
      }>(TRADE_QUERY, { tradeHash });
      return resp?.tradeByHash ?? null;
    },
  });

  return {
    data: data ?? null,
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}

export function useSecondaryTrades(params: {
  chainId?: number;
  take?: number;
  skip?: number;
}) {
  const { chainId, take = 50, skip = 0 } = params;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTradesAll', chainId, take, skip],
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        tradesConnection: { nodes: SecondaryTrade[] };
      }>(ALL_TRADES_QUERY, {
        filter: { chainId: chainId ?? null },
        first: take,
        after: cursorFromSkip(skip),
      });
      return resp?.tradesConnection?.nodes ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
