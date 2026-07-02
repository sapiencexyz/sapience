// Prediction data types, queries, and fetch helpers.
// Shared across SSR pages, client components, and OG image routes.

import { buildGraphQLGetUrl } from './graphql';
import {
  toPickConfigData,
  type PickConfigurationNode,
} from '~/lib/adapters/pickConfig';

// GraphQL document — runs against the /v2/graphql endpoint. Variables:
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

// Max page size for the conditions connection — ids are chunked to fit one page.
const CONDITIONS_PAGE_SIZE = 25;

// GraphQL document — runs against the /v2/graphql endpoint. Variables: { ids }.
// `id: conditionId` keeps the CTF hash under the stable `id` name.
export const CONDITIONS_BY_IDS_QUERY = `
  query ConditionsByIds($ids: [Bytes!]!) {
    conditions(
      first: 25
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
  /** Re-keyed stable string `${pickConfigId}:${conditionId}` — the GraphQL schema
   *  has no numeric Prisma row id. */
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

/** GraphQL wire shape of the PREDICTION_BY_ID_QUERY node (BigInt scalars may
 *  arrive as numbers). */
export type PredictionByIdNode = {
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
  pickConfig?: PickConfigurationNode | null;
};

/**
 * Pure mapper: GraphQL Prediction node → SSR `PredictionData`.
 *
 * - `marketAddress` := `escrow`
 * - `result` := `result ?? 'UNRESOLVED'` (the GraphQL result is nullable)
 * - BigInt scalars normalized via `String()`
 * - `pickConfig` via the shared adapter (escrow → marketAddress,
 *   resolver → conditionResolver, YES/NO → 1/0)
 */
export function toPredictionData(node: PredictionByIdNode): PredictionData {
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
// Both legs run against /v2/graphql over GET (CDN-cacheable — Apollo with
// csrfPrevention off serves queries, not mutations, over GET). Returns null
// prediction if not found. Throws on network errors.
// Pass `includeConditions: false` to skip the conditions leg when the caller
// already has the condition metadata (e.g. legs passed via query params).
export async function fetchPredictionWithConditions(
  predictionId: string,
  { includeConditions = true }: { includeConditions?: boolean } = {}
): Promise<{
  prediction: PredictionData | null;
  conditions: (ConditionData & { id: string })[];
}> {
  const resp = await fetch(
    buildGraphQLGetUrl(PREDICTION_BY_ID_QUERY, { predictionId })
  );
  if (!resp.ok) return { prediction: null, conditions: [] };
  const json = await resp.json();
  const node: PredictionByIdNode | null = json?.data?.prediction ?? null;
  if (!node) return { prediction: null, conditions: [] };
  const prediction = toPredictionData(node);

  const conditionIds = includeConditions
    ? (prediction.pickConfig?.picks.map((p) => p.conditionId) ?? [])
    : [];
  if (conditionIds.length === 0) return { prediction, conditions: [] };

  // The conditions connection caps each page at 25, so split the ids into
  // <=25-id chunks and merge — otherwise ids past the 25th would be dropped.
  const idChunks: string[][] = [];
  for (let i = 0; i < conditionIds.length; i += CONDITIONS_PAGE_SIZE) {
    idChunks.push(conditionIds.slice(i, i + CONDITIONS_PAGE_SIZE));
  }

  let conditions: (ConditionData & { id: string })[] = [];
  try {
    const chunkResults = await Promise.all(
      idChunks.map(async (ids) => {
        const condResp = await fetch(
          buildGraphQLGetUrl(CONDITIONS_BY_IDS_QUERY, { ids })
        );
        if (!condResp.ok) return [];
        const condJson = await condResp.json();
        return (condJson?.data?.conditions?.nodes ?? []) as (ConditionData & {
          id: string;
        })[];
      })
    );
    conditions = chunkResults.flat();
  } catch {
    // Condition fetch is non-critical
  }
  return { prediction, conditions };
}
