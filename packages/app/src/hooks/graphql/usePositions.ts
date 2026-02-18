'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

/**
 * Prediction - individual prediction record
 */
export type Prediction = {
  id: number;
  predictionId: string;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorToken: string;
  counterpartyToken: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  collateralDeposited?: string | null;
  collateralDepositedAt?: number | null;
  settled: boolean;
  settledAt?: number | null;
  settleTxHash?: string | null;
  result:
    | 'UNRESOLVED'
    | 'PREDICTOR_WINS'
    | 'COUNTERPARTY_WINS'
    | 'NON_DECISIVE';
  predictorClaimable?: string | null;
  counterpartyClaimable?: string | null;
  createTxHash: string;
  refCode?: string | null;
};

/** Pick in a pick configuration */
export type PickData = {
  id: number;
  pickConfigId: string;
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
};

/** Pick Configuration data */
export type PickConfigData = {
  id: string;
  chainId: number;
  marketAddress: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: string;
  resolvedAt?: number | null;
  predictorToken?: string | null;
  counterpartyToken?: string | null;
  endsAt?: number | null;
  picks: PickData[];
};

/**
 * Position Balance - ERC20 token balance for a user
 */
export type PositionBalance = {
  id: number;
  chainId: number;
  tokenAddress: string;
  pickConfigId: string;
  isPredictorToken: boolean;
  holder: string;
  balance: string;
  pickConfig?: PickConfigData | null;
};

// GraphQL queries
const PREDICTIONS_QUERY = /* GraphQL */ `
  query Predictions(
    $address: String!
    $chainId: Int
    $take: Int
    $skip: Int
  ) {
    predictions(
      address: $address
      chainId: $chainId
      take: $take
      skip: $skip
    ) {
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
      refCode
    }
  }
`;

const PREDICTIONS_COUNT_QUERY = /* GraphQL */ `
  query PredictionsCount($address: String!, $chainId: Int) {
    predictionsCount(address: $address, chainId: $chainId)
  }
`;

const POSITION_BALANCES_QUERY = /* GraphQL */ `
  query Positions($holder: String!, $chainId: Int) {
    positions(holder: $holder, chainId: $chainId) {
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
        claimedPredictorCollateral
        claimedCounterpartyCollateral
        resolved
        result
        resolvedAt
        predictorToken
        counterpartyToken
        endsAt
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
`;

/**
 * Hook to get predictions count for a user
 */
export function usePredictionsCount(address?: string, chainId?: number) {
  const enabled = Boolean(address);
  const { data } = useQuery({
    queryKey: ['predictionsCount', address, chainId],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ predictionsCount: number }>(
        PREDICTIONS_COUNT_QUERY,
        { address, chainId: chainId ?? null }
      );
      return resp?.predictionsCount ?? 0;
    },
  });
  return data ?? 0;
}

/**
 * Hook to get predictions for a user
 */
export function usePredictions(params: {
  address?: string;
  chainId?: number;
  take?: number;
  skip?: number;
}) {
  const { address, chainId, take = 50, skip = 0 } = params;
  const enabled = Boolean(address);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['predictions', address, chainId, take, skip],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ predictions: Prediction[] }>(
        PREDICTIONS_QUERY,
        {
          address,
          chainId: chainId ?? null,
          take,
          skip,
        }
      );
      return resp?.predictions ?? [];
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
 * Hook to get position balances (ERC20 tokens) for a user
 */
export function usePositionBalances(params: {
  holder?: string;
  chainId?: number;
}) {
  const { holder, chainId } = params;
  const enabled = Boolean(holder);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['positionBalances', holder, chainId],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        positions: PositionBalance[];
      }>(POSITION_BALANCES_QUERY, {
        holder,
        chainId: chainId ?? null,
      });
      return resp?.positions ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
