import { graphqlRequest } from '@sapience/ui/lib';
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
        return (data?.allTimeProfitLeaderboard || []).slice(0, 10);
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

// // Query hook for stETH per token data
// const useStEthPerToken = (chainId = 1) => {
//   return useQuery({
//     queryKey: ['stEthPerToken', chainId],
//     queryFn: async () => {
//       try {
//         const response = await foilApi.get(
//           `/getStEthPerTokenAtTimestamps?chainId=${chainId}`
//         );

//         // The stEthPerToken is directly in the response, not in response.data
//         if (
//           response?.stEthPerToken &&
//           typeof response.stEthPerToken === 'string'
//         ) {
//           return response.stEthPerToken;
//         }
//         console.warn('Using fallback stEthPerToken');
//         // Return a fallback value - typical stETH/wstETH ratio is around 1.1
//         // Multiply by 1e18 to match the expected format from the API
//         return '1100000000000000000'; // ~1.1 stETH per wstETH
//       } catch (error) {
//         console.error('Error fetching stEthPerToken:', error);
//         console.warn('Using fallback stEthPerToken due to error');
//         // Return a fallback value
//         return '1100000000000000000'; // ~1.1 stETH per wstETH
//       }
//     },
//     staleTime: 60 * 1000, // 1 minute
//   });
// };

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
