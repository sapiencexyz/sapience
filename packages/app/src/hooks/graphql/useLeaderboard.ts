import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
// Interface for aggregated data after processing
interface AggregatedLeaderboardEntry {
  owner: string;
  totalPnL: number; // Aggregated PnL as number (already USD-equivalent)
}

const GET_ALL_TIME_PROFIT_LEADERBOARD = /* GraphQL */ `
  query AllTimeProfitLeaderboard {
    allTimeProfitLeaderboard {
      owner
      totalPnL
    }
  }
`;

const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'], // server-aggregated now
    queryFn: async () => {
      try {
        const data = await graphqlRequest<{
          allTimeProfitLeaderboard: AggregatedLeaderboardEntry[];
        }>(GET_ALL_TIME_PROFIT_LEADERBOARD);
        return (data?.allTimeProfitLeaderboard || []).slice(0, 100);
      } catch (error) {
        console.error('Error in useAllTimeLeaderboard:', error);
        return [];
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
};

// No crypto prices hook; tokens are assumed $1

// (Removed legacy stEthPerToken query hook)

// --- Main Hook ---

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

// Export the interface for use in the component
export type { AggregatedLeaderboardEntry };
