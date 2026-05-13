'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchAccountAccuracyRank,
  type AccuracyRankResult,
} from '@sapience/sdk/queries';

/**
 * Per-address forecasting-accuracy rank. Backed by `Query.accountAccuracyRank` —
 * the resolver returns `accuracyScore: 0, rank: null` for addresses with no
 * scored attestations, so callers should treat `rank == null` as the
 * "not yet ranked" signal rather than a fetch error.
 */
export const useAccountAccuracyRank = (address?: string) => {
  const enabled = Boolean(address && address.trim() !== '');
  const addressLc = (address || '').toLowerCase();

  return useQuery<AccuracyRankResult>({
    queryKey: ['accountAccuracyRank', addressLc],
    enabled,
    queryFn: () => fetchAccountAccuracyRank(addressLc),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
