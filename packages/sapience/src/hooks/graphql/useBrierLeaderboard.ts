import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

type ForecasterScore = {
  attester: string;
  numScored: number;
  sumErrorSquared: number;
  meanBrier: number;
  numTimeWeighted: number;
  sumTimeWeightedError: number;
  timeWeightedMeanBrier: number;
};

const GET_TOP_FORECASTERS = /* GraphQL */ `
  query TopForecasters($limit: Int!) {
    topForecasters(limit: $limit) {
      attester
      numScored
      sumErrorSquared
      meanBrier
      numTimeWeighted
      sumTimeWeightedError
      timeWeightedMeanBrier
    }
  }
`;

export const useBrierLeaderboard = (limit = 10) => {
  return useQuery<ForecasterScore[]>({
    queryKey: ['brierLeaderboard', limit],
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
