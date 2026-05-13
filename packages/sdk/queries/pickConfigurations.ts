import { graphqlRequest } from './client/graphqlClient';

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations(
    $take: Int
    $skip: Int
    $chainId: Int
    $resolved: Boolean
  ) {
    pickConfigurationsPage(
      take: $take
      skip: $skip
      chainId: $chainId
      resolved: $resolved
    ) {
      items {
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
    pickConfigurationsPage: { items: PickConfigurationResult[] };
  }>(GET_PICK_CONFIGURATIONS, {
    take: opts?.take ?? 10,
    skip: opts?.skip ?? 0,
    chainId: opts?.chainId,
    resolved: opts?.resolved,
  });
  return data.pickConfigurationsPage?.items ?? [];
}
