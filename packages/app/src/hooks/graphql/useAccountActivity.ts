'use client';

import { useCallback, useMemo } from 'react';
import type { Address } from 'viem';
import { useInfiniteQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { Prediction, PickConfigData } from '~/hooks/graphql/usePositions';
import type { SecondaryTrade } from '~/hooks/graphql/useSecondaryTrades';

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

const ACCOUNT_ACTIVITY_QUERY = /* GraphQL */ `
  query AccountActivity($filters: ActivityFilters, $take: Int, $skip: Int) {
    accountActivityPage(filters: $filters, take: $take, skip: $skip) {
      items {
        type
        timestamp
        prediction {
          id
          predictionId
          chainId
          marketAddress
          predictor
          counterparty
          predictorToken
          counterpartyToken
          predictorCollateral
          counterpartyCollateral
          collateralDeposited
          collateralDepositedAt
          settled
          settledAt
          settleTxHash
          result
          predictorClaimable
          counterpartyClaimable
          createTxHash
          createdAt
          refCode
          isLegacy
          pickConfig {
            id
            chainId
            marketAddress
            totalPredictorCollateral
            totalCounterpartyCollateral
            claimedPredictorCollateral
            claimedCounterpartyCollateral
            resolved
            result
            resolvedAt
            predictorToken
            counterpartyToken
            endsAt
            isLegacy
            predictionId
            picks {
              id
              pickConfigId
              conditionResolver
              conditionId
              predictedOutcome
              condition {
                id
                shortName
                optionName
                question
                description
                endTime
                resolver
                settled
                resolvedToYes
                nonDecisive
                estimatedPrice
                category {
                  slug
                }
              }
            }
          }
        }
        trade {
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
          pickConfig {
            id
            chainId
            marketAddress
            totalPredictorCollateral
            totalCounterpartyCollateral
            claimedPredictorCollateral
            claimedCounterpartyCollateral
            resolved
            result
            resolvedAt
            predictorToken
            counterpartyToken
            endsAt
            isLegacy
            picks {
              id
              pickConfigId
              conditionResolver
              conditionId
              predictedOutcome
              condition {
                id
                shortName
                optionName
                question
                description
                endTime
                resolver
                settled
                resolvedToYes
                nonDecisive
                estimatedPrice
                category {
                  slug
                }
              }
            }
          }
        }
      }
    }
  }
`;

type RawActivityItem = {
  type: 'prediction' | 'trade';
  timestamp: number;
  prediction: Prediction | null;
  trade: (SecondaryTrade & { pickConfig?: PickConfigData | null }) | null;
};

const DEFAULT_PAGE_SIZE = 20;

export function useAccountActivity({
  account,
  pageSize = DEFAULT_PAGE_SIZE,
  activityType,
  pickConfigId,
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
      conditionId ?? null,
      pageSize,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    initialPageParam: 0,
    getNextPageParam: (lastPage: RawActivityItem[], allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    queryFn: async ({ pageParam = 0 }) => {
      const resp = await graphqlRequest<{
        accountActivityPage: { items: RawActivityItem[] };
      }>(ACCOUNT_ACTIVITY_QUERY, {
        filters: {
          address: account ?? null,
          type: typeFilter ?? null,
          pickConfigId: pickConfigId ?? null,
          conditionId: conditionId ?? null,
        },
        take: pageSize,
        skip: pageParam,
      });
      return resp?.accountActivityPage?.items ?? [];
    },
  });

  const rawItems = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Only show loading spinner on true initial load (no data yet)
  const isLoading = initialLoading && !data;
  const isFetchingMore = isFetchingNextPage;

  // Map raw items to typed ActivityItems, skipping malformed entries
  const items: ActivityItem[] = useMemo(() => {
    const mapped: ActivityItem[] = [];
    for (const raw of rawItems) {
      if (raw.type === 'prediction' && raw.prediction) {
        mapped.push({
          type: 'prediction',
          timestamp: raw.timestamp * 1000,
          prediction: raw.prediction,
          pickConfig: raw.prediction.pickConfig ?? null,
          isPredictorSide: account
            ? raw.prediction.predictor.toLowerCase() === account.toLowerCase()
            : true,
        });
      } else if (raw.type === 'trade' && raw.trade) {
        mapped.push({
          type: 'trade',
          timestamp: raw.timestamp * 1000,
          trade: raw.trade,
          pickConfig: raw.trade.pickConfig ?? null,
          isBuyer: account
            ? raw.trade.buyer.toLowerCase() === account.toLowerCase()
            : false,
        });
      }
    }
    return mapped;
  }, [rawItems, account]);

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
