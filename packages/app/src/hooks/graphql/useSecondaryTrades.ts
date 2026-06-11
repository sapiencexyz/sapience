'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequestV2 } from '@sapience/sdk/queries/client/graphqlClient';

/**
 * Secondary-market trade as consumed by the app. v2 drops the numeric
 * Prisma row id — trades are keyed by their canonical on-chain `tradeHash`.
 * `executedAt` is epoch seconds in both v1 and v2 (UnixSeconds).
 */
export type SecondaryTrade = {
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

/** v2 wire shape of a Trade node (BigInt scalars may arrive as numbers). */
type TradeV2Node = {
  tradeHash: string;
  chainId: number;
  token: string;
  collateral: string;
  seller: string;
  buyer: string;
  tokenAmount: string | number;
  price: string | number;
  txHash: string;
  blockNumber: number;
  executedAt: number;
};

const TRADE_FIELDS = `
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
`;

/**
 * v2 collapses v1's seller-query + buyer-query + client merge into a single
 * `participant` filter (either side). Explicit orderBy — v2 defaults can
 * differ from v1's.
 */
export const TRADES_BY_PARTICIPANT_QUERY = `
  query TradesByParticipant(
    $participant: Address!
    $chainId: Int
    $first: Int
  ) {
    trades(
      filter: { participant: $participant, chainId: $chainId }
      first: $first
      orderBy: { field: EXECUTED_AT, direction: DESC }
    ) {
      nodes {
        ${TRADE_FIELDS}
      }
    }
  }
`;

export const ALL_TRADES_QUERY = `
  query AllTrades($chainId: Int, $first: Int) {
    trades(
      filter: { chainId: $chainId }
      first: $first
      orderBy: { field: EXECUTED_AT, direction: DESC }
    ) {
      nodes {
        ${TRADE_FIELDS}
      }
    }
  }
`;

export const TRADE_QUERY = `
  query Trade($tradeHash: Bytes32!) {
    trade(tradeHash: $tradeHash) {
      ${TRADE_FIELDS}
    }
  }
`;

/**
 * Pure mapper: v2 Trade node → SecondaryTrade. Normalizes BigInt scalar
 * fields via `String()` (the BigInt scalar can serialize small values as
 * numbers) and drops anything the app shape doesn't declare.
 */
function toSecondaryTrade(node: TradeV2Node): SecondaryTrade {
  return {
    tradeHash: node.tradeHash,
    chainId: node.chainId,
    token: node.token,
    collateral: node.collateral,
    seller: node.seller,
    buyer: node.buyer,
    tokenAmount: String(node.tokenAmount),
    price: String(node.price),
    txHash: node.txHash,
    blockNumber: node.blockNumber,
    executedAt: node.executedAt,
  };
}

type TradesV2Response = { trades: { nodes: TradeV2Node[] } | null };

export function useSecondaryTradesByAddress(params: {
  address?: string;
  chainId?: number;
  take?: number;
  /** v1 offset pagination; v2 is keyset-based, so only the first page
   *  (skip = 0, the only value call sites use) is addressable. Kept for
   *  signature stability. */
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
      const resp = await graphqlRequestV2<TradesV2Response>(
        TRADES_BY_PARTICIPANT_QUERY,
        {
          participant: address,
          chainId: chainId ?? null,
          first: take,
        }
      );
      // Server-side EXECUTED_AT DESC replaces the v1 client merge + sort.
      return (resp?.trades?.nodes ?? []).map(toSecondaryTrade);
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
      const resp = await graphqlRequestV2<{ trade: TradeV2Node | null }>(
        TRADE_QUERY,
        { tradeHash }
      );
      return resp?.trade ? toSecondaryTrade(resp.trade) : null;
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
  /** See useSecondaryTradesByAddress — kept for signature stability. */
  skip?: number;
}) {
  const { chainId, take = 50, skip = 0 } = params;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTradesAll', chainId, take, skip],
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const resp = await graphqlRequestV2<TradesV2Response>(ALL_TRADES_QUERY, {
        chainId: chainId ?? null,
        first: take,
      });
      return (resp?.trades?.nodes ?? []).map(toSecondaryTrade);
    },
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
