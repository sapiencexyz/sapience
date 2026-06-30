'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import {
  PICK_CONFIGURATION_V2_FIELDS,
  toPickConfigData,
  type PickConfigurationV2Node,
} from '~/lib/adapters/pickConfig';
import {
  POSITION_V2_FIELDS,
  toPositionBalance,
  type PositionV2Node,
} from '~/lib/adapters/position';
import { useCursorPagination } from '~/hooks/useCursorPagination';

/**
 * Prediction - individual prediction record. v2 drops the numeric Prisma
 * row id — predictions are keyed by their on-chain `predictionId`.
 */
export type Prediction = {
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
  isLegacy: boolean;
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

/** Pick in a pick configuration.
 *
 *  `id` is transitional: v2 sources re-key it to the stable string
 *  `${pickConfigId}:${conditionId}` (the numeric Prisma row id is gone),
 *  while the v1 positions half still returns numbers until wave 3.
 *  Collapses to `string` once positions flip. */
export type PickData = {
  id: number | string;
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
  /** v2 lifecycle discriminator. v1 encoded SOLD rows implicitly in the id
   *  shape (`<rowId>-sell-<tradeHash>`); v2 surfaces it explicitly. Absent on
   *  rows not produced by the positions synthesis. */
  status?: 'OPEN' | 'SOLD' | null;
  createdAt: string;
  updatedAt: string;
  pickConfig?: PickConfigData | null;
};

// ─── v2 prediction documents + mapper ────────────────────────────────────────
//
// The prediction half of this module runs against /v2/graphql. Documents are
// plain untagged template literals (the app's graphql-eslint validates tagged
// docs against the v1 schema). The positions half below stays on v1 until
// wave 3.

/**
 * Selection set for a v2 `Prediction` node, matching {@link PredictionV2Node}.
 * Shared with the activity feed's `... on Prediction` inline fragment
 * (useAccountActivity).
 */
export const PREDICTION_V2_FIELDS = `
  predictionId
  chainId
  escrow
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
    ${PICK_CONFIGURATION_V2_FIELDS}
  }
`;

/** v2 wire shape of a Prediction node (BigInt scalars may arrive as numbers). */
export type PredictionV2Node = {
  predictionId: string;
  chainId: number;
  escrow: string;
  predictor: string;
  counterparty: string;
  predictorToken?: string | null;
  counterpartyToken?: string | null;
  predictorCollateral: string | number;
  counterpartyCollateral: string | number;
  collateralDeposited?: string | number | null;
  collateralDepositedAt?: number | null;
  settled: boolean;
  settledAt?: number | null;
  settleTxHash?: string | null;
  result: 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE' | null;
  predictorClaimable?: string | number | null;
  counterpartyClaimable?: string | number | null;
  createTxHash: string;
  createdAt: string;
  refCode?: string | null;
  isLegacy: boolean;
  pickConfig?: PickConfigurationV2Node | null;
};

/**
 * Pure mapper: v2 Prediction node → app `Prediction`.
 *
 * - `marketAddress` := `escrow`
 * - `result` := `result ?? 'UNRESOLVED'` (v2 result is nullable)
 * - BigInt scalars normalized via `String()`
 * - `pickConfig` via the shared adapter; its v1-only `predictionId` field is
 *   backfilled from the parent prediction (v2 dropped it — the parent is the
 *   prediction).
 * - v2's nullable tokens collapse to `''` to keep the v1 non-null field
 *   shape (no consumer reads tokens off predictions today).
 */
export function toPrediction(node: PredictionV2Node): Prediction {
  return {
    predictionId: node.predictionId,
    chainId: node.chainId,
    marketAddress: node.escrow,
    predictor: node.predictor,
    counterparty: node.counterparty,
    predictorToken: node.predictorToken ?? '',
    counterpartyToken: node.counterpartyToken ?? '',
    predictorCollateral: String(node.predictorCollateral),
    counterpartyCollateral: String(node.counterpartyCollateral),
    collateralDeposited:
      node.collateralDeposited != null
        ? String(node.collateralDeposited)
        : null,
    collateralDepositedAt: node.collateralDepositedAt ?? null,
    settled: node.settled,
    settledAt: node.settledAt ?? null,
    settleTxHash: node.settleTxHash ?? null,
    result: node.result ?? 'UNRESOLVED',
    predictorClaimable:
      node.predictorClaimable != null ? String(node.predictorClaimable) : null,
    counterpartyClaimable:
      node.counterpartyClaimable != null
        ? String(node.counterpartyClaimable)
        : null,
    createTxHash: node.createTxHash,
    createdAt: node.createdAt,
    refCode: node.refCode ?? null,
    isLegacy: node.isLegacy,
    pickConfig: node.pickConfig
      ? {
          ...toPickConfigData(node.pickConfig),
          predictionId: node.predictionId,
        }
      : null,
  };
}

export const PREDICTIONS_QUERY = `
  query Predictions($participant: Address!, $chainId: Int, $first: Int) {
    predictions(
      filter: { participant: $participant, chainId: $chainId }
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        ${PREDICTION_V2_FIELDS}
      }
    }
  }
`;

// Slim projection for the question page chart — only the fields scatterData
// reads. Picks deliberately omit the embedded `condition` objects: the full
// embed blew the server-side complexity budget at 100 rows (same reason v1
// slimmed this doc), and the chart never reads them.
export const PREDICTIONS_BY_CONDITION_QUERY = `
  query PredictionsByCondition($conditionId: Bytes!, $first: Int) {
    predictions(
      filter: { conditionIds: [$conditionId] }
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        predictionId
        chainId
        escrow
        predictor
        counterparty
        predictorCollateral
        counterpartyCollateral
        collateralDepositedAt
        createdAt
        pickConfig {
          pickConfigId
          chainId
          escrow
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
            conditionId
            resolver
            predictedOutcome
          }
        }
      }
    }
  }
`;

/** Wire shape of the slim by-condition projection. `pickConfig` carries the
 *  full scalar set (so the shared adapter maps it) but its picks have no
 *  embedded condition. */
type PredictionByConditionV2Node = Pick<
  PredictionV2Node,
  | 'predictionId'
  | 'chainId'
  | 'escrow'
  | 'predictor'
  | 'counterparty'
  | 'predictorCollateral'
  | 'counterpartyCollateral'
  | 'collateralDepositedAt'
  | 'createdAt'
  | 'pickConfig'
>;

// The chart reads a subset of Prediction; v1 returned the same partial rows
// under the full type, so the cast preserves the existing contract.
function toScatterPrediction(node: PredictionByConditionV2Node): Prediction {
  const partial: Partial<Prediction> = {
    predictionId: node.predictionId,
    chainId: node.chainId,
    marketAddress: node.escrow,
    predictor: node.predictor,
    counterparty: node.counterparty,
    predictorCollateral: String(node.predictorCollateral),
    counterpartyCollateral: String(node.counterpartyCollateral),
    collateralDepositedAt: node.collateralDepositedAt ?? null,
    createdAt: node.createdAt,
    pickConfig: node.pickConfig
      ? {
          ...toPickConfigData(node.pickConfig),
          predictionId: node.predictionId,
        }
      : null,
  };
  return partial as Prediction;
}

// Count-only connection: first: 0 returns no rows but a correct totalCount.
export const PREDICTIONS_COUNT_QUERY = `
  query PredictionsCount($participant: Address!, $chainId: Int) {
    predictions(
      filter: { participant: $participant, chainId: $chainId }
      first: 0
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      totalCount
    }
  }
`;

export const PREDICTION_QUERY = `
  query Prediction($predictionId: Bytes32!) {
    prediction(predictionId: $predictionId) {
      ${PREDICTION_V2_FIELDS}
    }
  }
`;

// v2 connection over synthesized position rows — replaces v1's skip/take
// `positionsPage`. Both the by-holder and by-condition hooks share this
// document; only the `PositionFilter` differs (passed as a variable).
//
// `pageInfo.hasNextPage` is raw-row truth: a page whose rows all synthesized
// away still reports `true` while more underlying rows exist, so always page
// on `pageInfo` (which `useCursorPagination` does), never on node count.
export const POSITIONS_V2_QUERY = `
  query Positions(
    $filter: PositionFilter
    $first: Int!
    $after: String
    $orderBy: PositionOrder
  ) {
    positions(filter: $filter, first: $first, after: $after, orderBy: $orderBy) {
      edges {
        node {
          ${POSITION_V2_FIELDS}
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
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
      const resp = await graphqlRequest<{
        predictions: { totalCount: number } | null;
      }>(PREDICTIONS_COUNT_QUERY, {
        participant: address,
        chainId: chainId ?? null,
      });
      return resp?.predictions?.totalCount ?? 0;
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
  /** v1 offset pagination; v2 is keyset-based, so only the first page
   *  (skip = 0, the only value call sites use) is addressable. Kept for
   *  signature stability. */
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
      const resp = await graphqlRequest<{
        predictions: { nodes: PredictionV2Node[] } | null;
      }>(PREDICTIONS_QUERY, {
        participant: address,
        chainId: chainId ?? null,
        first: take,
      });
      return (resp?.predictions?.nodes ?? []).map(toPrediction);
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}

const DEFAULT_POSITIONS_PAGE_SIZE = 15;

/**
 * Server-side ordering for the positions connection. RESOLVED_AT orders by
 * `pickConfiguration.resolvedAt` across the whole resolved set (so the
 * client can sort by resolution time across pages, not just the fetched
 * page); the server restricts to resolved positions for that field.
 */
export type PositionOrderInput = {
  field: 'CREATED_AT' | 'UPDATED_AT' | 'RESOLVED_AT';
  direction: 'ASC' | 'DESC';
};

/**
 * Hook to get position balances (ERC20 tokens) for a user, paginated.
 */
export function usePositionBalances(params: {
  holder?: string;
  chainId?: number;
  settled?: boolean;
  pageSize?: number;
  orderBy?: PositionOrderInput;
}) {
  const {
    holder,
    chainId,
    settled,
    pageSize = DEFAULT_POSITIONS_PAGE_SIZE,
    orderBy,
  } = params;

  const filter = useMemo(() => {
    const f: Record<string, unknown> = { holder };
    if (chainId != null) f.chainId = chainId;
    if (settled != null) f.settled = settled;
    return f;
  }, [holder, chainId, settled]);

  const {
    data: nodes,
    isLoading,
    isFetchingMore,
    isFetching,
    hasNextPage,
    loadMore,
    error,
    refetch,
  } = useCursorPagination<PositionV2Node>({
    // orderBy in the key so switching/toggling sort resets pagination.
    queryKey: [
      'positionBalances',
      holder,
      chainId,
      settled,
      orderBy?.field ?? null,
      orderBy?.direction ?? null,
    ],
    query: POSITIONS_V2_QUERY,
    connectionKey: 'positions',
    pageSize,
    variables: { filter, orderBy },
    enabled: Boolean(holder),
  });

  const items = useMemo(() => nodes.map(toPositionBalance), [nodes]);

  return {
    data: items,
    isLoading,
    isFetchingMore,
    isFetching,
    hasMore: hasNextPage,
    fetchMore: loadMore,
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
  orderBy?: PositionOrderInput;
}) {
  const {
    conditionId,
    pageSize = DEFAULT_POSITIONS_PAGE_SIZE,
    settled,
    orderBy,
  } = params;

  const filter = useMemo(() => {
    const f: Record<string, unknown> = { conditionIds: [conditionId] };
    if (settled != null) f.settled = settled;
    return f;
  }, [conditionId, settled]);

  const {
    data: nodes,
    isLoading,
    isFetchingMore,
    isFetching,
    hasNextPage,
    loadMore,
    error,
    refetch,
  } = useCursorPagination<PositionV2Node>({
    queryKey: [
      'positionBalancesByCondition',
      conditionId,
      settled,
      orderBy?.field ?? null,
      orderBy?.direction ?? null,
    ],
    query: POSITIONS_V2_QUERY,
    connectionKey: 'positions',
    pageSize,
    variables: { filter, orderBy },
    enabled: Boolean(conditionId),
  });

  const items = useMemo(() => nodes.map(toPositionBalance), [nodes]);

  return {
    data: items,
    isLoading,
    isFetchingMore,
    isFetching,
    hasMore: hasNextPage,
    fetchMore: loadMore,
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
  /** See `usePredictions` — kept for signature stability. */
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
      const resp = await graphqlRequest<{
        predictions: { nodes: PredictionByConditionV2Node[] } | null;
      }>(PREDICTIONS_BY_CONDITION_QUERY, { conditionId, first: take });
      return (resp?.predictions?.nodes ?? []).map(toScatterPrediction);
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
      const resp = await graphqlRequest<{
        prediction: PredictionV2Node | null;
      }>(PREDICTION_QUERY, { predictionId });
      return resp?.prediction ? toPrediction(resp.prediction) : null;
    },
  });

  return {
    data: data ?? null,
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
