import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchAccountStatsLeaderboard,
  type AggregatedLeaderboardEntry,
} from '@sapience/sdk/queries';

const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'],
    queryFn: async () => {
      try {
        // Source from the unified `accountStatsLeaderboard` (metric=NET_PNL,
        // no `from` ⇒ all-time). `netPnL` is wei; ProfitCell expects a
        // human-readable decimal string so we divide here.
        const entries = await fetchAccountStatsLeaderboard({
          metric: 'NET_PNL',
          limit: 100,
        });
        return entries.map((e) => ({
          address: e.address,
          totalPnL: (parseFloat(e.netPnL) / 1e18).toString(),
        }));
      } catch (error) {
        console.error('Error in useAllTimeLeaderboard:', error);
        return [];
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
};

export const useLeaderboard = () => {
  const { data: leaderboardData, isLoading } = useAllTimeLeaderboard();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  return {
    leaderboardData,
    isLoading,
    selectedTimeframe,
    setSelectedTimeframe,
  };
};

export type { AggregatedLeaderboardEntry };
