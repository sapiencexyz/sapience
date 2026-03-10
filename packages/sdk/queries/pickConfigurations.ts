import { graphqlRequest } from './client/graphqlClient';

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations($take: Int, $skip: Int, $chainId: Int) {
    pickConfigurations(take: $take, skip: $skip, chainId: $chainId) {
      id
      chainId
      totalPredictorCollateral
      totalCounterpartyCollateral
      resolved
      picks {
        conditionId
        conditionResolver
        predictedOutcome
      }
    }
  }
`;

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
  }[];
}

export async function fetchPickConfigurations(opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
}): Promise<PickConfigurationResult[]> {
  const data = await graphqlRequest<{
    pickConfigurations: PickConfigurationResult[];
  }>(GET_PICK_CONFIGURATIONS, {
    take: opts?.take ?? 10,
    skip: opts?.skip ?? 0,
    chainId: opts?.chainId,
  });
  return data.pickConfigurations ?? [];
}
