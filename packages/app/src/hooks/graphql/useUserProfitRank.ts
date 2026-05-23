'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchUserProfitRank,
  type UserProfitRankResult,
} from '@sapience/sdk/queries';

export const useUserProfitRank = (ownerAddress?: string) => {
  const enabled = Boolean(ownerAddress && ownerAddress.trim() !== '');
  const addressLc = (ownerAddress || '').toLowerCase();

  return useQuery<UserProfitRankResult>({
    queryKey: ['userProfitRank', addressLc],
    enabled,
    queryFn: () => fetchUserProfitRank(addressLc),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
