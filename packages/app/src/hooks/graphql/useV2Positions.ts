'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

/**
 * V2 Pick type - individual condition selection in a prediction
 */
export type V2Pick = {
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number; // 0 = YES, 1 = NO
  condition?: {
    id: string;
    question?: string | null;
    shortName?: string | null;
    endTime?: number | null;
    settled?: boolean;
    resolvedToYes?: boolean;
  } | null;
};

/**
 * V2 Pick Configuration - shared parimutuel pool
 */
export type V2PickConfiguration = {
  id: string; // pickConfigId
  chainId: number;
  marketAddress: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: 'UNRESOLVED' | 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE';
  resolvedAt?: number | null;
  predictorToken?: string | null;
  counterpartyToken?: string | null;
  endsAt?: number | null;
  picks: V2Pick[];
};

/**
 * V2 Prediction - individual prediction within a pick configuration
 */
export type V2Prediction = {
  id: number;
  predictionId: string;
  chainId: number;
  marketAddress: string;
  pickConfigId: string;
  predictor: string;
  counterparty: string;
  predictorWager: string;
  counterpartyWager: string;
  predictorTokensMinted: string;
  counterpartyTokensMinted: string;
  predictorNonce: string;
  counterpartyNonce: string;
  settled: boolean;
  settledAt?: number | null;
  mintedAt: number;
  mintTxHash: string;
  settleTxHash?: string | null;
  refCode?: string | null;
  pickConfig?: V2PickConfiguration;
};

/**
 * V2 Position Balance - ERC20 token balance for a user
 */
export type V2PositionBalance = {
  id: number;
  chainId: number;
  tokenAddress: string;
  pickConfigId: string;
  isPredictorToken: boolean;
  holder: string;
  balance: string;
  pickConfig?: V2PickConfiguration;
};

// GraphQL queries for V2 data
const V2_PREDICTIONS_QUERY = /* GraphQL */ `
  query V2Predictions(
    $address: String!
    $chainId: Int
    $take: Int
    $skip: Int
  ) {
    v2Predictions(
      address: $address
      chainId: $chainId
      take: $take
      skip: $skip
    ) {
      id
      predictionId
      chainId
      marketAddress
      pickConfigId
      predictor
      counterparty
      predictorWager
      counterpartyWager
      predictorTokensMinted
      counterpartyTokensMinted
      predictorNonce
      counterpartyNonce
      settled
      settledAt
      mintedAt
      mintTxHash
      settleTxHash
      refCode
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
        picks {
          conditionResolver
          conditionId
          predictedOutcome
          condition {
            id
            question
            shortName
            endTime
            settled
            resolvedToYes
          }
        }
      }
    }
  }
`;

const V2_PREDICTIONS_COUNT_QUERY = /* GraphQL */ `
  query V2PredictionsCount($address: String!, $chainId: Int) {
    v2PredictionsCount(address: $address, chainId: $chainId)
  }
`;

const V2_POSITION_BALANCES_QUERY = /* GraphQL */ `
  query V2PositionBalances($holder: String!, $chainId: Int) {
    v2PositionBalances(holder: $holder, chainId: $chainId) {
      id
      chainId
      tokenAddress
      pickConfigId
      isPredictorToken
      holder
      balance
      pickConfig {
        id
        chainId
        marketAddress
        totalPredictorCollateral
        totalCounterpartyCollateral
        resolved
        result
        resolvedAt
        predictorToken
        counterpartyToken
        endsAt
        picks {
          conditionResolver
          conditionId
          predictedOutcome
          condition {
            id
            question
            shortName
            endTime
            settled
            resolvedToYes
          }
        }
      }
    }
  }
`;

/**
 * Hook to get V2 predictions count for a user
 */
export function useV2PredictionsCount(address?: string, chainId?: number) {
  const enabled = Boolean(address);
  const { data } = useQuery({
    queryKey: ['v2PredictionsCount', address, chainId],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ v2PredictionsCount: number }>(
        V2_PREDICTIONS_COUNT_QUERY,
        { address, chainId: chainId ?? null }
      );
      return resp?.v2PredictionsCount ?? 0;
    },
  });
  return data ?? 0;
}

/**
 * Hook to get V2 predictions for a user
 */
export function useV2Predictions(params: {
  address?: string;
  chainId?: number;
  take?: number;
  skip?: number;
}) {
  const { address, chainId, take = 50, skip = 0 } = params;
  const enabled = Boolean(address);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['v2Predictions', address, chainId, take, skip],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ v2Predictions: V2Prediction[] }>(
        V2_PREDICTIONS_QUERY,
        {
          address,
          chainId: chainId ?? null,
          take,
          skip,
        }
      );
      return resp?.v2Predictions ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}

/**
 * Hook to get V2 position balances (ERC20 tokens) for a user
 */
export function useV2PositionBalances(params: {
  holder?: string;
  chainId?: number;
}) {
  const { holder, chainId } = params;
  const enabled = Boolean(holder);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['v2PositionBalances', holder, chainId],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ v2PositionBalances: V2PositionBalance[] }>(
        V2_POSITION_BALANCES_QUERY,
        {
          holder,
          chainId: chainId ?? null,
        }
      );
      return resp?.v2PositionBalances ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
