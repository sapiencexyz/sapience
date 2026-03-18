// Prediction data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { getGraphQLEndpoint } from './graphql';

export const PREDICTION_BY_ID_QUERY = `
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
      settled
      settledAt
      result
      createdAt
      pickConfig {
        id
        chainId
        marketAddress
        resolved
        result
        resolvedAt
        endsAt
        picks {
          id
          conditionResolver
          conditionId
          predictedOutcome
        }
      }
    }
  }
`;

export const CONDITIONS_BY_IDS_QUERY = `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
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
`;

export interface PredictionPick {
  id: number;
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
  settled: boolean;
  settledAt?: number | null;
  result: string;
  createdAt: string;
  pickConfig?: PredictionPickConfig | null;
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

// Fetch a prediction and its associated conditions by ID.
// Returns null prediction if not found. Throws on network errors.
export async function fetchPredictionWithConditions(
  predictionId: string
): Promise<{
  prediction: PredictionData | null;
  conditions: (ConditionData & { id: string })[];
}> {
  const endpoint = getGraphQLEndpoint();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: PREDICTION_BY_ID_QUERY,
      variables: { id: predictionId },
    }),
  });
  if (!resp.ok) return { prediction: null, conditions: [] };
  const json = await resp.json();
  const prediction: PredictionData | null = json?.data?.prediction ?? null;
  if (!prediction) return { prediction: null, conditions: [] };

  const conditionIds =
    prediction.pickConfig?.picks.map((p) => p.conditionId) ?? [];
  if (conditionIds.length === 0) return { prediction, conditions: [] };

  let conditions: (ConditionData & { id: string })[] = [];
  try {
    const condResp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CONDITIONS_BY_IDS_QUERY,
        variables: { where: { id: { in: conditionIds } } },
      }),
    });
    if (condResp.ok) {
      const condJson = await condResp.json();
      conditions = condJson?.data?.conditions ?? [];
    }
  } catch {
    // Condition fetch is non-critical
  }
  return { prediction, conditions };
}
