'use client';

import { useCallback, useMemo } from 'react';
import type { Address } from 'viem';
import { useInfiniteQuery } from '@tanstack/react-query';
import { graphqlRequestV2 } from '@sapience/sdk/queries/client/graphqlClient';
import {
  PREDICTION_V2_FIELDS,
  toPrediction,
  type Prediction,
  type PredictionV2Node,
  type PickConfigData,
} from '~/hooks/graphql/usePositions';
import type { SecondaryTrade } from '~/hooks/graphql/useSecondaryTrades';
import {
  PICK_CONFIGURATION_V2_FIELDS,
  toPickConfigData,
  type PickConfigurationV2Node,
} from '~/lib/adapters/pickConfig';

export type PredictionActivity = {
  type: 'prediction';
  timestamp: number;
  prediction: Prediction;
  pickConfig: PickConfigData | null;
  isPredictorSide: boolean;
};

export type TradeActivity = {
  type: 'trade';
  timestamp: number;
  trade: SecondaryTrade;
  pickConfig: PickConfigData | null;
  isBuyer: boolean;
};

export type ActivityItem = PredictionActivity | TradeActivity;

// v2 returns the Prediction | Trade union directly under
// `edges { node }` — v1's `accountActivity` envelope (with its
// per-type `prediction` / `trade` wrappers and double query) is gone.
// `edges { timestamp }` (epoch seconds) is the interleave sort key for
// BOTH types; using it as the single source of time kills the v1
// mixed-units bug (trades in seconds vs predictions in ISO strings).
export const ACCOUNT_ACTIVITY_QUERY = `
  query AccountActivity(
    $account: Address
    $conditionIds: [Bytes!]
    $pickConfigId: Bytes32
    $token: Address
    $types: [ActivityType!]
    $first: Int!
    $after: String
  ) {
    activity(
      first: $first
      after: $after
      filter: {
        account: $account
        conditionIds: $conditionIds
        pickConfigId: $pickConfigId
        token: $token
        types: $types
      }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        timestamp
        node {
          __typename
          ... on Prediction {
            ${PREDICTION_V2_FIELDS}
          }
          ... on Trade {
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
            pickConfig {
              ${PICK_CONFIGURATION_V2_FIELDS}
            }
          }
        }
      }
    }
  }
`;

/** v2 wire shape of a Trade in the activity union (BigInt scalars may
 *  arrive as numbers). */
type TradeV2ActivityNode = {
  __typename: 'Trade';
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
  pickConfig?: PickConfigurationV2Node | null;
};

type PredictionV2ActivityNode = PredictionV2Node & {
  __typename: 'Prediction';
};

type ActivityEdgeV2 = {
  /** Interleave sort key: `Trade.executedAt` for trades, epoch seconds of
   *  `Prediction.createdAt` for predictions. */
  timestamp: number;
  node: PredictionV2ActivityNode | TradeV2ActivityNode;
};

type ActivityConnectionV2 = {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: ActivityEdgeV2[];
};

const EMPTY_ACTIVITY_PAGE: ActivityConnectionV2 = {
  totalCount: 0,
  pageInfo: { hasNextPage: false, endCursor: null },
  edges: [],
};

/**
 * Pure mapper: one v2 activity edge → the hook's item envelope. The edge's
 * `timestamp` (epoch seconds) is THE time for every item type (×1000 for
 * ms); pickConfigs map through the shared adapter.
 */
function toActivityItem(
  edge: ActivityEdgeV2,
  account?: string
): ActivityItem | null {
  const timestampMs = edge.timestamp * 1000;
  const { node } = edge;

  if (node.__typename === 'Prediction') {
    const prediction = toPrediction(node);
    return {
      type: 'prediction',
      timestamp: timestampMs,
      prediction,
      pickConfig: prediction.pickConfig ?? null,
      isPredictorSide: account
        ? prediction.predictor.toLowerCase() === account.toLowerCase()
        : true,
    };
  }

  if (node.__typename === 'Trade') {
    return {
      type: 'trade',
      timestamp: timestampMs,
      trade: {
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
      },
      pickConfig: node.pickConfig ? toPickConfigData(node.pickConfig) : null,
      isBuyer: account
        ? node.buyer.toLowerCase() === account.toLowerCase()
        : false,
    };
  }

  return null;
}

const DEFAULT_PAGE_SIZE = 20;

export function useAccountActivity({
  account,
  pageSize = DEFAULT_PAGE_SIZE,
  activityType,
  pickConfigId,
  token,
  conditionId,
  enabled: enabledOverride,
}: {
  account?: Address;
  pageSize?: number;
  activityType?: string;
  /**
   * Scope the feed to a single pick configuration. Filters predictions by
   * pickConfigId and trades by the pickConfig's predictor/counterparty tokens.
   */
  pickConfigId?: string;
  /**
   * Scope the feed to a single position token. With `account`, predictions
   * only match the side that minted that token; trades match exact token.
   */
  token?: Address;
  /**
   * Scope the feed to a condition. Matches every pick configuration whose
   * picks reference this conditionId.
   */
  conditionId?: string;
  /**
   * Override enabled state. Defaults to true — the unscoped feed returns
   * recent global activity. Pass false to skip the query entirely.
   */
  enabled?: boolean;
}) {
  const enabled = enabledOverride ?? true;

  const typeFilter =
    activityType && activityType !== 'all' ? activityType : undefined;
  // v2 ActivityFilter.types: null means "all"; [] would be a zero-result
  // query, so the unfiltered case must send null.
  const types =
    typeFilter === 'prediction'
      ? ['PREDICTION']
      : typeFilter === 'trade'
        ? ['TRADE']
        : null;

  const {
    data,
    isLoading: initialLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'accountActivity',
      account ?? 'global',
      typeFilter,
      pickConfigId ?? null,
      token ?? null,
      conditionId ?? null,
      pageSize,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Forward-only cursor pagination: thread the previous page's endCursor
    // in as `after` (v1 was skip/take with a length-based stop signal).
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: ActivityConnectionV2) =>
      lastPage.pageInfo.hasNextPage
        ? (lastPage.pageInfo.endCursor ?? undefined)
        : undefined,
    queryFn: async ({ pageParam }) => {
      const resp = await graphqlRequestV2<{
        activity: ActivityConnectionV2 | null;
      }>(ACCOUNT_ACTIVITY_QUERY, {
        account: account ?? null,
        conditionIds: conditionId ? [conditionId] : null,
        pickConfigId: pickConfigId ?? null,
        token: token ?? null,
        types,
        first: pageSize,
        after: pageParam ?? null,
      });
      return resp?.activity ?? EMPTY_ACTIVITY_PAGE;
    },
  });

  // Only show loading spinner on true initial load (no data yet)
  const isLoading = initialLoading && !data;
  const isFetchingMore = isFetchingNextPage;

  // Map edges to typed ActivityItems, deduping on the domain id
  // (predictionId / tradeHash) — cursor boundaries can overlap on refetch.
  const items: ActivityItem[] = useMemo(() => {
    const seen = new Set<string>();
    const mapped: ActivityItem[] = [];
    for (const page of data?.pages ?? []) {
      for (const edge of page.edges) {
        const item = toActivityItem(edge, account);
        if (!item) continue;
        const key =
          item.type === 'prediction'
            ? `Prediction:${item.prediction.predictionId}`
            : `Trade:${item.trade.tradeHash}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mapped.push(item);
      }
    }
    return mapped;
  }, [data, account]);

  const hasMore = Boolean(hasNextPage);
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    items,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
  };
}
