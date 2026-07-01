'use client';

import { useQuery } from '@tanstack/react-query';
import { paginateConnection } from '@sapience/sdk/queries';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

/**
 * Secondary-market trade as consumed by the app. There is no numeric
 * Prisma row id — trades are keyed by their canonical on-chain `tradeHash`.
 * `executedAt` is epoch seconds (UnixSeconds).
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

/** Wire shape of a Trade node (BigInt scalars may arrive as numbers). */
type TradeNode = {
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
 * A single `participant` filter (either side) collapses what used to be a
 * separate seller-query + buyer-query + client merge. Explicit orderBy —
 * server defaults can differ from the previous query's.
 */
export const TRADES_BY_PARTICIPANT_QUERY = `
  query TradesByParticipant(
    $participant: Address!
    $chainId: Int
    $first: Int
    $after: String
  ) {
    trades(
      filter: { participant: $participant, chainId: $chainId }
      first: $first
      after: $after
      orderBy: { field: EXECUTED_AT, direction: DESC }
    ) {
      nodes {
        ${TRADE_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const ALL_TRADES_QUERY = `
  query AllTrades($chainId: Int, $first: Int, $after: String) {
    trades(
      filter: { chainId: $chainId }
      first: $first
      after: $after
      orderBy: { field: EXECUTED_AT, direction: DESC }
    ) {
      nodes {
        ${TRADE_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
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
 * Pure mapper: Trade node → SecondaryTrade. Normalizes BigInt scalar
 * fields via `String()` (the BigInt scalar can serialize small values as
 * numbers) and drops anything the app shape doesn't declare.
 */
function toSecondaryTrade(node: TradeNode): SecondaryTrade {
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

type TradesResponse = {
  trades: {
    nodes: TradeNode[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

/**
 * Walks the keyset-paginated `trades` connection to exhaustion, accumulating
 * every node. The connection has no load-more UI, so we resolve the COMPLETE
 * set here rather than rendering a single truncated page.
 */
async function fetchAllTrades(
  query: string,
  variables: Record<string, unknown>
): Promise<SecondaryTrade[]> {
  const nodes = await paginateConnection<TradeNode>({
    fetchPage: async ({ first, after }) => {
      const resp: TradesResponse = await graphqlRequest(query, {
        ...variables,
        first,
        after,
      });
      return {
        nodes: resp?.trades?.nodes ?? [],
        pageInfo: resp?.trades?.pageInfo,
      };
    },
  });

  // Server-side EXECUTED_AT DESC replaces the old client merge + sort.
  return nodes.map(toSecondaryTrade);
}

export function useSecondaryTradesByAddress(params: {
  address?: string;
  chainId?: number;
}) {
  const { address, chainId } = params;
  const enabled = Boolean(address);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTrades', address, chainId],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () =>
      fetchAllTrades(TRADES_BY_PARTICIPANT_QUERY, {
        participant: address,
        chainId: chainId ?? null,
      }),
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
      const resp = await graphqlRequest<{ trade: TradeNode | null }>(
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

export function useSecondaryTrades(params: { chainId?: number }) {
  const { chainId } = params;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['secondaryTradesAll', chainId],
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      fetchAllTrades(ALL_TRADES_QUERY, {
        chainId: chainId ?? null,
      }),
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
