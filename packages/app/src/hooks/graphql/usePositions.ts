'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import {
  PICK_CONFIGURATION_FIELDS,
  toPickConfigData,
  type PickConfigurationNode,
} from '~/lib/adapters/pickConfig';
import {
  POSITION_FIELDS,
  toPositionBalance,
  type PositionNode,
} from '~/lib/adapters/position';
import { useCursorPagination } from '~/hooks/useCursorPagination';

/**
 * Prediction - individual prediction record. There is no numeric Prisma
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
 *  `id` is transitional: prediction-sourced rows re-key it to the stable
 *  string `${pickConfigId}:${conditionId}` (the numeric Prisma row id is gone),
 *  while position-sourced rows still return numbers until wave 3.
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
  /** Lifecycle discriminator. SOLD rows used to be encoded implicitly in the id
   *  shape (`<rowId>-sell-<tradeHash>`); now it is surfaced explicitly. Absent
   *  on rows not produced by the positions synthesis. */
  status?: 'OPEN' | 'SOLD' | null;
  createdAt: string;
  updatedAt: string;
  pickConfig?: PickConfigData | null;
};

// ─── prediction documents + mapper ───────────────────────────────────────────
//
// The whole module runs against the GraphQL endpoint (/v2/graphql). Documents
// are plain untagged template literals so the app's graphql-eslint (which
// validates tagged docs against the legacy schema) skips them. The positions
// half below still returns numeric ids until wave 3.

/**
 * Selection set for a `Prediction` node, matching {@link PredictionNode}.
 * Shared with the activity feed's `... on Prediction` inline fragment
 * (useAccountActivity).
 */
export const PREDICTION_FIELDS = `
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
    ${PICK_CONFIGURATION_FIELDS}
  }
`;

/** Wire shape of a Prediction node (BigInt scalars may arrive as numbers). */
export type PredictionNode = {
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
  pickConfig?: PickConfigurationNode | null;
};

/**
 * Pure mapper: Prediction node → app `Prediction`.
 *
 * - `marketAddress` := `escrow`
 * - `result` := `result ?? 'UNRESOLVED'` (result is nullable)
 * - BigInt scalars normalized via `String()`
 * - `pickConfig` via the shared adapter; its legacy `predictionId` field is
 *   backfilled from the parent prediction (the schema dropped it — the parent
 *   is the prediction).
 * - nullable tokens collapse to `''` to keep the non-null field
 *   shape (no consumer reads tokens off predictions today).
 */
export function toPrediction(node: PredictionNode): Prediction {
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
        ${PREDICTION_FIELDS}
      }
    }
  }
`;

// Slim projection for the question page chart — only the fields scatterData
// reads. Picks deliberately omit the embedded `condition` objects: the full
// embed blew the server-side complexity budget at 100 rows (the same reason
// this doc was slimmed before), and the chart never reads them.
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
type PredictionByConditionNode = Pick<
  PredictionNode,
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

// The chart reads a subset of Prediction; the previous query returned the same
// partial rows under the full type, so the cast preserves the existing contract.
function toScatterPrediction(node: PredictionByConditionNode): Prediction {
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
      ${PREDICTION_FIELDS}
    }
  }
`;

// Cursor connection over synthesized position rows — replaces the old skip/take
// `positionsPage`. Both the by-holder and by-condition hooks share this
// document; only the `PositionFilter` differs (passed as a variable).
//
// `pageInfo.hasNextPage` is raw-row truth: a page whose rows all synthesized
// away still reports `true` while more underlying rows exist, so always page
// on `pageInfo` (which `useCursorPagination` does), never on node count.
export const POSITIONS_QUERY = `
  query Positions(
    $filter: PositionFilter
    $first: Int!
    $after: String
    $orderBy: PositionOrder
  ) {
    positions(filter: $filter, first: $first, after: $after, orderBy: $orderBy) {
      edges {
        node {
          ${POSITION_FIELDS}
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
  /** Legacy offset pagination; the connection is keyset-based, so only the
   *  first page (skip = 0, the only value call sites use) is addressable. Kept
   *  for signature stability. */
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
        predictions: { nodes: PredictionNode[] } | null;
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
  } = useCursorPagination<PositionNode>({
    // orderBy in the key so switching/toggling sort resets pagination.
    queryKey: [
      'positionBalances',
      holder,
      chainId,
      settled,
      orderBy?.field ?? null,
      orderBy?.direction ?? null,
    ],
    query: POSITIONS_QUERY,
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
  } = useCursorPagination<PositionNode>({
    queryKey: [
      'positionBalancesByCondition',
      conditionId,
      settled,
      orderBy?.field ?? null,
      orderBy?.direction ?? null,
    ],
    query: POSITIONS_QUERY,
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
        predictions: { nodes: PredictionByConditionNode[] } | null;
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
        prediction: PredictionNode | null;
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
