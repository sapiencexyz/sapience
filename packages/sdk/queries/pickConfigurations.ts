import { graphqlRequest } from './client/graphqlClient';

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations(
    $first: Int
    $after: String
    $filter: PickConfigurationFilter
  ) {
    pickConfigurations(
      first: $first
      after: $after
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface PickConfigurationCondition {
  /** CTF on-chain condition id (lowercase 0x-hex) — `conditionId`. */
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
  /** Deterministic on-chain pickConfigId hash — `pickConfigId`. */
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

/** The pickConfigurations connection's max page size. */
const MAX_PAGE_SIZE = 100;

type PickNode = {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition?: PickConfigurationCondition | null;
};

type PickConfigurationNode = {
  pickConfigId: string;
  chainId: number;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  resolved: boolean;
  picks: PickNode[];
};

type PickConfigurationsResponse = {
  pickConfigurations: {
    nodes: PickConfigurationNode[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

function toPickConfigurationResult(
  node: PickConfigurationNode
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

  const target = skip + take;
  const nodes: PickConfigurationNode[] = [];
  let after: string | null = null;

  while (nodes.length < target) {
    const first = Math.min(target - nodes.length, MAX_PAGE_SIZE);
    const data: PickConfigurationsResponse =
      await graphqlRequest<PickConfigurationsResponse>(
        GET_PICK_CONFIGURATIONS,
        {
          first,
          after,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        }
      );
    const pageNodes = data?.pickConfigurations?.nodes;
    if (!Array.isArray(pageNodes)) {
      throw new Error(
        'Failed to fetch pick configurations: Invalid response structure'
      );
    }
    nodes.push(...pageNodes);
    const pageInfo = data.pickConfigurations.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return nodes.map(toPickConfigurationResult).slice(skip, skip + take);
}
