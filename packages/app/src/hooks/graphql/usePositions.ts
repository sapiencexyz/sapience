'use client';

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  createdAt: string;
  refCode?: string | null;
  pickConfig?: PickConfigData | null;
};

/** Embedded condition metadata on a Pick. Mirrors the shape that
 *  `useConditionsByIds` returns so consumers can build a conditionsMap
 *  without a follow-up query. */
export type PickConditionData = {
  id: string;
  shortName?: string | null;
  optionName?: string | null;
  question?: string | null;
  description?: string | null;
  endTime?: number | null;
  resolver?: string | null;
  category?: { slug?: string | null } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  estimatedPrice?: number | null;
};

/** Pick in a pick configuration */
export type PickData = {
  id: number;
  pickConfigId: string;
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
  condition?: PickConditionData | null;
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
  isLegacy: boolean;
  picks: PickData[];
  predictionId?: string | null;
};

/**
 * Position Balance - ERC20 token balance for a user
 */
export type PositionBalance = {
  id: string;
  chainId: number;
  tokenAddress: string;
  pickConfigId: string;
  isPredictorToken: boolean;
  holder: string;
  balance: string;
  userCollateral?: string | null;
  totalPayout?: string | null;
  realizedPnL?: string | null;
  createdAt: string;
  updatedAt: string;
  pickConfig?: PickConfigData | null;
};

// GraphQL queries
//
// `picks.condition` is fetched inline so consumers can render the full
// row without a follow-up `useConditionsByIds` round trip. The server
// pre-loads conditions per request — see Pick resolver + escrow/activity
// resolvers.
const PICK_CONDITION_FRAGMENT = `
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
`;

const PICK_CONFIG_FRAGMENT = `
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
      ${PICK_CONDITION_FRAGMENT}
    }
  }
`;

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
      createdAt
      refCode
      ${PICK_CONFIG_FRAGMENT}
    }
  }
`;

const PREDICTIONS_BY_CONDITION_QUERY = /* GraphQL */ `
  query PredictionsByCondition(
    $conditionId: String!
    $take: Int
    $skip: Int
  ) {
    predictions(
      conditionId: $conditionId
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
      createdAt
      refCode
      ${PICK_CONFIG_FRAGMENT}
    }
  }
`;

const PREDICTIONS_COUNT_QUERY = /* GraphQL */ `
  query PredictionsCount($address: String!, $chainId: Int) {
    predictionCount(address: $address, chainId: $chainId)
  }
`;

const PREDICTION_QUERY = /* GraphQL */ `
  query Prediction($id: String!) {
    prediction(id: $id) {
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
      ${PICK_CONFIG_FRAGMENT}
    }
  }
`;

const POSITION_BALANCES_QUERY = /* GraphQL */ `
  query Positions(
    $holder: String!
    $chainId: Int
    $settled: Boolean
    $take: Int
    $skip: Int
  ) {
    positions(
      holder: $holder
      chainId: $chainId
      settled: $settled
      take: $take
      skip: $skip
    ) {
      id
      chainId
      tokenAddress
      pickConfigId
      isPredictorToken
      holder
      balance
      userCollateral
      totalPayout
      realizedPnL
      createdAt
      updatedAt
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
          ${PICK_CONDITION_FRAGMENT}
        }
      }
    }
  }
`;

const POSITION_BALANCES_BY_CONDITION_QUERY = /* GraphQL */ `
  query PositionsByCondition(
    $conditionId: String!
    $take: Int
    $skip: Int
    $settled: Boolean
  ) {
    positions(
      conditionId: $conditionId
      take: $take
      skip: $skip
      settled: $settled
    ) {
      id
      chainId
      tokenAddress
      pickConfigId
      isPredictorToken
      holder
      balance
      userCollateral
      totalPayout
      realizedPnL
      createdAt
      updatedAt
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
          ${PICK_CONDITION_FRAGMENT}
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
      const resp = await graphqlRequest<{ predictionCount: number }>(
        PREDICTIONS_COUNT_QUERY,
        { address, chainId: chainId ?? null }
      );
      return resp?.predictionCount ?? 0;
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

const DEFAULT_POSITIONS_PAGE_SIZE = 50;

/**
 * Hook to get position balances (ERC20 tokens) for a user, paginated.
 */
export function usePositionBalances(params: {
  holder?: string;
  chainId?: number;
  settled?: boolean;
  pageSize?: number;
}) {
  const {
    holder,
    chainId,
    settled,
    pageSize = DEFAULT_POSITIONS_PAGE_SIZE,
  } = params;
  const enabled = Boolean(holder);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['positionBalances', holder, chainId, settled, pageSize],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: 0,
    getNextPageParam: (lastPage: PositionBalance[], allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    queryFn: async ({ pageParam = 0 }) => {
      const resp = await graphqlRequest<{
        positions: PositionBalance[];
      }>(POSITION_BALANCES_QUERY, {
        holder,
        chainId: chainId ?? null,
        settled: settled ?? null,
        take: pageSize,
        skip: pageParam,
      });
      return resp?.positions ?? [];
    },
  });

  const items = useMemo(() => data?.pages.flat() ?? [], [data]);
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    data: items,
    isLoading: !!enabled && isLoading,
    isFetchingMore: isFetchingNextPage,
    isFetching: !!enabled && isFetching,
    hasMore: Boolean(hasNextPage),
    fetchMore,
    error,
    refetch,
  };
}

/**
 * Hook to get position balances for a condition (all holders), paginated.
 */
export function usePositionBalancesByConditionId(params: {
  conditionId?: string;
  pageSize?: number;
  settled?: boolean;
}) {
  const {
    conditionId,
    pageSize = DEFAULT_POSITIONS_PAGE_SIZE,
    settled,
  } = params;
  const enabled = Boolean(conditionId);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['positionBalancesByCondition', conditionId, pageSize, settled],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: 0,
    getNextPageParam: (lastPage: PositionBalance[], allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length * pageSize,
    queryFn: async ({ pageParam = 0 }) => {
      const resp = await graphqlRequest<{
        positions: PositionBalance[];
      }>(POSITION_BALANCES_BY_CONDITION_QUERY, {
        conditionId,
        take: pageSize,
        skip: pageParam,
        settled: settled ?? null,
      });
      return resp?.positions ?? [];
    },
  });

  const items = useMemo(() => data?.pages.flat() ?? [], [data]);
  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    data: items,
    isLoading: !!enabled && isLoading,
    isFetchingMore: isFetchingNextPage,
    isFetching: !!enabled && isFetching,
    hasMore: Boolean(hasNextPage),
    fetchMore,
    error,
    refetch,
  };
}

/**
 * Hook to get predictions for a condition
 */
export function usePredictionsByConditionId(params: {
  conditionId?: string;
  take?: number;
  skip?: number;
}) {
  const { conditionId, take = 50, skip = 0 } = params;
  const enabled = Boolean(conditionId);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['predictionsByCondition', conditionId, take, skip],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ predictions: Prediction[] }>(
        PREDICTIONS_BY_CONDITION_QUERY,
        { conditionId, take, skip }
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
 * Hook to get a single prediction by predictionId (includes pickConfig)
 */
export function usePrediction(predictionId?: string) {
  const enabled = Boolean(predictionId);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['prediction', predictionId],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ prediction: Prediction | null }>(
        PREDICTION_QUERY,
        { id: predictionId }
      );
      return resp?.prediction ?? null;
    },
  });

  return {
    data: data ?? null,
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
