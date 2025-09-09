'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

export interface ForecasterRankResult {
  accuracyScore: number | null;
  rank: number | null;
  totalForecasters: number;
}

const GET_ACCURACY_RANK = /* GraphQL */ `
  query AccuracyRankByAddress($attester: String!) {
    accuracyRankByAddress(attester: $attester) {
      attester
      accuracyScore
      rank
      totalForecasters
    }
  }
`;

export const useForecasterRank = (attester?: string) => {
  const enabled = Boolean(attester && attester.trim() !== '');
  const a = (attester || '').toLowerCase();

  return useQuery<ForecasterRankResult>({
    queryKey: ['forecasterRank', a],
    enabled,
    queryFn: async () => {
      const data = await graphqlRequest<{
        accuracyRankByAddress: {
          accuracyScore: number;
          rank: number | null;
          totalForecasters: number;
        };
      }>(GET_ACCURACY_RANK, { attester: a });
      const r = data?.accuracyRankByAddress;
      if (!r) return { accuracyScore: null, rank: null, totalForecasters: 0 };
      return {
        accuracyScore: r.accuracyScore ?? 0,
        rank: r.rank,
        totalForecasters: r.totalForecasters ?? 0,
      };
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
