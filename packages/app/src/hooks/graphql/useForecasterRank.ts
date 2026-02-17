'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchForecasterRank,
  type ForecasterRankResult,
} from '@sapience/sdk/queries';

export const useForecasterRank = (attester?: string) => {
  const enabled = Boolean(attester && attester.trim() !== '');
  const a = (attester || '').toLowerCase();

  return useQuery<ForecasterRankResult>({
    queryKey: ['forecasterRank', a],
    enabled,
    queryFn: () => fetchForecasterRank(a),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
