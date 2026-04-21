'use client';

import { useMemo, useState } from 'react';
import type { Address } from 'viem';
import { useQuery } from '@tanstack/react-query';
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
  query AccountActivity(
    $address: String
    $take: Int
    $skip: Int
    $type: String
    $pickConfigId: String
    $conditionId: String
  ) {
    accountActivity(
      address: $address
      take: $take
      skip: $skip
      type: $type
      pickConfigId: $pickConfigId
      conditionId: $conditionId
    ) {
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
   * Override enabled state. Defaults to true when account, pickConfigId, or
   * conditionId is provided; otherwise returns the global feed.
   */
  enabled?: boolean;
}) {
  const [take, setTake] = useState(pageSize);
  const enabled =
    enabledOverride ?? Boolean(account || pickConfigId || conditionId);

  const typeFilter =
    activityType && activityType !== 'all' ? activityType : undefined;

  const {
    data,
    isLoading: initialLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      'accountActivity',
      account ?? 'global',
      take,
      typeFilter,
      pickConfigId ?? null,
      conditionId ?? null,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (
      prev: { accountActivity: RawActivityItem[] } | undefined
    ) => prev,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        accountActivity: RawActivityItem[];
      }>(ACCOUNT_ACTIVITY_QUERY, {
        address: account ?? null,
        take,
        skip: 0,
        type: typeFilter ?? null,
        pickConfigId: pickConfigId ?? null,
        conditionId: conditionId ?? null,
      });
      return resp ?? { accountActivity: [] };
    },
  });

  const rawItems = useMemo(() => data?.accountActivity ?? [], [data]);

  // Only show loading spinner on true initial load (no data yet)
  const isLoading = initialLoading && !data;
  const isFetchingMore = isFetching && !!data;

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

  const hasMore = rawItems.length >= take;
  const fetchMore = () => setTake((t) => t + pageSize);

  return {
    items,
    isLoading,
    isFetchingMore,
    hasMore,
    fetchMore,
  };
}
