// Prediction data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { getGraphQLEndpoint } from './graphql';
import {
  toPickConfigData,
  type PickConfigurationV2Node,
} from '~/lib/adapters/pickConfig';

// v2 document — runs against the /v2/graphql endpoint. Variables:
// { predictionId }. The pickConfig carries the full scalar set (mapped via
// the shared adapter) but slim picks: condition metadata comes from the
// separate CONDITIONS_BY_IDS_QUERY leg, so the heavy embed is skipped.
export const PREDICTION_BY_ID_QUERY = `
  query Prediction($predictionId: Bytes32!) {
    prediction(predictionId: $predictionId) {
      predictionId
      chainId
      escrow
      predictor
      counterparty
      predictorToken
      counterpartyToken
      predictorCollateral
      counterpartyCollateral
      settled
      settledAt
      result
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
`;

// v2 document — runs against the /v2/graphql endpoint. Variables: { ids }.
// `id: conditionId` keeps the CTF hash under the stable `id` name.
export const CONDITIONS_BY_IDS_QUERY = `
  query ConditionsByIds($ids: [Bytes!]!) {
    conditions(
      first: 100
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: { conditionIds: $ids }
    ) {
      nodes {
        id: conditionId
        question
        shortName
        endTime
        settled
        resolvedToYes
        nonDecisive
        resolver
        category { slug }
      }
    }
  }
`;

export interface PredictionPick {
  /** Re-keyed stable string `${pickConfigId}:${conditionId}` — v2 drops the
   *  numeric Prisma row id. */
  id: string;
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
}

export interface PredictionPickConfig {
  id: string;
  chainId: number;
  marketAddress: string;
  resolved: boolean;
  result: string;
  resolvedAt?: number | null;
  endsAt?: number | null;
  picks: PredictionPick[];
}

export interface PredictionData {
  predictionId: string;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorToken: string | null;
  counterpartyToken: string | null;
  predictorCollateral: string;
  counterpartyCollateral: string;
  settled: boolean;
  settledAt?: number | null;
  result: string;
  createdAt: string;
  pickConfig?: PredictionPickConfig | null;
}

/** v2 wire shape of the PREDICTION_BY_ID_QUERY node (BigInt scalars may
 *  arrive as numbers). */
export type PredictionByIdV2Node = {
  predictionId: string;
  chainId: number;
  escrow: string;
  predictor: string;
  counterparty: string;
  predictorToken?: string | null;
  counterpartyToken?: string | null;
  predictorCollateral: string | number;
  counterpartyCollateral: string | number;
  settled: boolean;
  settledAt?: number | null;
  result: 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE' | null;
  createdAt: string;
  pickConfig?: PickConfigurationV2Node | null;
};

/**
 * Pure mapper: v2 Prediction node → SSR `PredictionData`.
 *
 * - `marketAddress` := `escrow`
 * - `result` := `result ?? 'UNRESOLVED'` (v2 result is nullable)
 * - BigInt scalars normalized via `String()`
 * - `pickConfig` via the shared adapter (escrow → marketAddress,
 *   resolver → conditionResolver, YES/NO → 1/0)
 */
export function toPredictionData(node: PredictionByIdV2Node): PredictionData {
  return {
    predictionId: node.predictionId,
    chainId: node.chainId,
    marketAddress: node.escrow,
    predictor: node.predictor,
    counterparty: node.counterparty,
    predictorToken: node.predictorToken ?? null,
    counterpartyToken: node.counterpartyToken ?? null,
    predictorCollateral: String(node.predictorCollateral),
    counterpartyCollateral: String(node.counterpartyCollateral),
    settled: node.settled,
    settledAt: node.settledAt ?? null,
    result: node.result ?? 'UNRESOLVED',
    createdAt: node.createdAt,
    pickConfig: node.pickConfig ? toPickConfigData(node.pickConfig) : null,
  };
}

export interface ConditionData {
  id: string;
  question?: string | null;
  shortName?: string | null;
  endTime?: number | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  resolver?: string | null;
  category?: { slug?: string | null } | null;
}

// Fetch a prediction and its associated conditions by predictionId.
// Both legs run against /v2/graphql. Returns null prediction if not found.
// Throws on network errors.
export async function fetchPredictionWithConditions(
  predictionId: string
): Promise<{
  prediction: PredictionData | null;
  conditions: (ConditionData & { id: string })[];
}> {
  const resp = await fetch(getGraphQLEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: PREDICTION_BY_ID_QUERY,
      variables: { predictionId },
    }),
  });
  if (!resp.ok) return { prediction: null, conditions: [] };
  const json = await resp.json();
  const node: PredictionByIdV2Node | null = json?.data?.prediction ?? null;
  if (!node) return { prediction: null, conditions: [] };
  const prediction = toPredictionData(node);

  const conditionIds =
    prediction.pickConfig?.picks.map((p) => p.conditionId) ?? [];
  if (conditionIds.length === 0) return { prediction, conditions: [] };

  let conditions: (ConditionData & { id: string })[] = [];
  try {
    const condResp = await fetch(getGraphQLEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CONDITIONS_BY_IDS_QUERY,
        variables: { ids: conditionIds },
      }),
    });
    if (condResp.ok) {
      const condJson = await condResp.json();
      conditions = condJson?.data?.conditions?.nodes ?? [];
    }
  } catch {
    // Condition fetch is non-critical
  }
  return { prediction, conditions };
}
