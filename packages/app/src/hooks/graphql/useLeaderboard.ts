import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchLeaderboard,
  type AggregatedLeaderboardEntry,
} from '@sapience/sdk/queries';

const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'],
    queryFn: async () => {
      try {
        return await fetchLeaderboard();
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
