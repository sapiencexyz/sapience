import { graphqlRequest } from './client/graphqlClient';

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations($first: Int, $filter: PickConfigurationFilter) {
    pickConfigurations(
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: $filter
    ) {
      nodes {
        pickConfigId
        chainId
        totalPredictorCollateral
        totalCounterpartyCollateral
        resolved
        picks {
          conditionId
          resolver
          predictedOutcome
          condition {
            id: conditionId
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
`;

export interface PickConfigurationCondition {
  /** CTF on-chain condition id (lowercase 0x-hex) — v2 `conditionId`. */
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
}

export interface PickConfigurationResult {
  /** Deterministic on-chain pickConfigId hash — v2 `pickConfigId`. */
  id: string;
  chainId: number;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  resolved: boolean;
  picks: {
    conditionId: string;
    conditionResolver: string;
    predictedOutcome: number;
    condition?: PickConfigurationCondition | null;
  }[];
}

/** v2 maxTake for the pickConfigurations connection. */
const V2_MAX_FIRST = 100;

type PickV2Node = {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition?: PickConfigurationCondition | null;
};

type PickConfigurationV2Node = {
  pickConfigId: string;
  chainId: number;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  resolved: boolean;
  picks: PickV2Node[];
};

type PickConfigurationsV2Response = {
  pickConfigurations: { nodes: PickConfigurationV2Node[] };
};

function toPickConfigurationResult(
  node: PickConfigurationV2Node
): PickConfigurationResult {
  return {
    id: node.pickConfigId,
    chainId: node.chainId,
    totalPredictorCollateral: String(node.totalPredictorCollateral ?? '0'),
    totalCounterpartyCollateral: String(
      node.totalCounterpartyCollateral ?? '0'
    ),
    resolved: node.resolved,
    picks: (node.picks ?? []).map((pick) => ({
      conditionId: pick.conditionId,
      conditionResolver: pick.resolver,
      predictedOutcome: pick.predictedOutcome === 'YES' ? 1 : 0,
      condition: pick.condition ?? null,
    })),
  };
}

function toPickConfigurationResults(
  data: PickConfigurationsV2Response | null
): PickConfigurationResult[] {
  const nodes = data?.pickConfigurations?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(
      'Failed to fetch pick configurations: Invalid response structure'
    );
  }
  return nodes.map(toPickConfigurationResult);
}

export async function fetchPickConfigurations(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  resolved?: boolean;
}): Promise<PickConfigurationResult[]> {
  const take = opts?.take ?? 10;
  const skip = opts?.skip ?? 0;

  const filter: Record<string, unknown> = {};
  if (opts?.chainId !== undefined) filter.chainId = opts.chainId;
  if (opts?.resolved !== undefined) filter.resolved = opts.resolved;

  // v2 connections cursor-paginate; emulate the v1 offset contract by
  // over-fetching (capped at the server's maxTake) and slicing locally.
  const first = Math.min(take + skip, V2_MAX_FIRST);

  const data = await graphqlRequest<PickConfigurationsV2Response>(
    GET_PICK_CONFIGURATIONS,
    {
      first,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }
  );

  return toPickConfigurationResults(data).slice(skip, skip + take);
}
