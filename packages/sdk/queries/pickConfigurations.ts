import { graphqlRequest } from './client/graphqlClient';

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations(
    $filter: PickConfigurationFilter
    $first: Int
    $after: String
  ) {
    pickConfigurationsConnection(
      filter: $filter
      first: $first
      after: $after
    ) {
      nodes {
        id
        chainId
        totalPredictorCollateral
        totalCounterpartyCollateral
        resolved
        picks {
          conditionId
          conditionResolver
          predictedOutcome
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
        }
      }
    }
  }
`;

export interface PickConfigurationCondition {
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

export async function fetchPickConfigurations(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  resolved?: boolean;
}): Promise<PickConfigurationResult[]> {
  const data = await graphqlRequest<{
    pickConfigurationsConnection: { nodes: PickConfigurationResult[] };
  }>(GET_PICK_CONFIGURATIONS, {
    first: opts?.take ?? 10,
    after: cursorFromSkip(opts?.skip ?? 0),
    filter: {
      chainId: opts?.chainId ?? null,
      resolved: opts?.resolved ?? null,
    },
  });
  return data.pickConfigurationsConnection?.nodes ?? [];
}

const cursorFromSkip = (skip: number): string | null => {
  if (skip <= 0) return null;
  return btoa(JSON.stringify({ k: String(skip - 1), id: String(skip - 1) }));
};
