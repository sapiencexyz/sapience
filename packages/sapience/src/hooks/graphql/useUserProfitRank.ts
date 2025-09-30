'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

export interface UserProfitRankResult {
  totalPnL: number;
  rank: number | null;
  totalParticipants: number;
}

export const useUserProfitRank = (ownerAddress?: string) => {
  const enabled = Boolean(ownerAddress && ownerAddress.trim() !== '');
  const addressLc = (ownerAddress || '').toLowerCase();

  return useQuery<UserProfitRankResult>({
    queryKey: ['userProfitRank', addressLc],
    enabled,
    queryFn: async () => {
      // Use the combined all-time profit leaderboard that includes both market and parlay PnL
      const GET_ALL_TIME_PROFIT_LEADERBOARD = /* GraphQL */ `
        query AllTimeProfitLeaderboard {
          allTimeProfitLeaderboard {
            owner
            totalPnL
          }
        }
      `;

      type AllTimeLeaderboardResponse = {
        allTimeProfitLeaderboard: Array<{
          owner: string;
          totalPnL: number;
        }>;
      };

      const data = await graphqlRequest<AllTimeLeaderboardResponse>(
        GET_ALL_TIME_PROFIT_LEADERBOARD
      );

      const entries = data?.allTimeProfitLeaderboard || [];

      // Sort by totalPnL descending
      const sortedEntries = entries.sort((a, b) => b.totalPnL - a.totalPnL);

      const totalParticipants = sortedEntries.length;
      const index = sortedEntries.findIndex(
        (e) => e.owner.toLowerCase() === addressLc
      );
      const userEntry = sortedEntries.find(
        (e) => e.owner.toLowerCase() === addressLc
      );
      const totalPnL = userEntry?.totalPnL || 0;
      const rank = index >= 0 ? index + 1 : null;

      return { totalPnL, rank, totalParticipants };
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
