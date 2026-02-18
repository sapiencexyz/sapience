import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

type ForecasterScore = {
  attester: string;
  numScored: number;
  sumErrorSquared: number;
  numTimeWeighted: number;
  sumTimeWeightedError: number;
  accuracyScore: number;
};

const GET_TOP_FORECASTERS = /* GraphQL */ `
  query TopForecasters($limit: Int!) {
    topForecasters(limit: $limit) {
      attester
      numScored
      sumErrorSquared
      numTimeWeighted
      sumTimeWeightedError
      accuracyScore
    }
  }
`;

export const useAccuracyLeaderboard = (limit = 10) => {
  return useQuery<ForecasterScore[]>({
    queryKey: ['accuracyLeaderboard', limit],
    queryFn: async () => {
      const data = await graphqlRequest<{ topForecasters: ForecasterScore[] }>(
        GET_TOP_FORECASTERS,
        { limit }
      );
      return data.topForecasters || [];
    },
  });
};

export type { ForecasterScore };
