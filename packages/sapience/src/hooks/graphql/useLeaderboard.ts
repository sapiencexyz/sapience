import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';

// All tokens are assumed to be worth $1; no REST price lookups.

// Interface for aggregated data after processing
interface AggregatedLeaderboardEntry {
  owner: string;
  totalPnL: number; // Aggregated PnL as number
}

// Query to fetch all market groups and their markets
const GET_MARKET_GROUPS = /* GraphQL */ `
  query MarketGroups {
    marketGroups {
      address
      chainId
      markets {
        marketId
        public
      }
    }
  }
`;

// Query to fetch leaderboard for a specific market
const GET_MARKET_LEADERBOARD = /* GraphQL */ `
  query MarketLeaderboard(
    $chainId: Int!
    $address: String!
    $marketId: String!
  ) {
    getMarketLeaderboard(
      chainId: $chainId
      address: $address
      marketId: $marketId
    ) {
      owner
      totalPnL # This is a string representing BigInt
      collateralAddress
      collateralSymbol
      collateralDecimals
    }
  }
`;

// Interface for the raw response of GET_MARKET_LEADERBOARD
interface RawMarketLeaderboardEntry {
  owner: string;
  totalPnL: string;
  collateralAddress?: string;
  collateralSymbol?: string;
  collateralDecimals?: number;
}

// Type definitions for GraphQL responses
type MarketGroupsQueryResponse = {
  marketGroups: MarketGroupType[];
};

type MarketLeaderboardQueryResponse = {
  getMarketLeaderboard: RawMarketLeaderboardEntry[];
};

// Hook revised for client-side aggregation
const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'], // Query key remains simple for now
    queryFn: async () => {
      console.log(
        '[useAllTimeLeaderboard DEBUG] Starting leaderboard query...'
      );
      try {
        // 1. Fetch all markets
        const marketGroupsData =
          await graphqlRequest<MarketGroupsQueryResponse>(GET_MARKET_GROUPS);

        if (!marketGroupsData?.marketGroups) {
          console.error('No market group data found');
          return [];
        }

        // 2. Identify all public market group / market pairs
        const publicMarketIdentifiers: {
          address: string;
          chainId: number;
          marketId: string;
        }[] = [];
        marketGroupsData.marketGroups.forEach((marketGroup) => {
          // Type guard: skip if address or chainId is missing or not correct type
          if (!marketGroup.address || typeof marketGroup.address !== 'string')
            return;
          if (typeof marketGroup.chainId !== 'number') return;
          (marketGroup.markets || []).forEach((market) => {
            if (market.public) {
              publicMarketIdentifiers.push({
                address: marketGroup.address!,
                chainId: marketGroup.chainId,
                marketId: String(market.marketId), // Ensure marketId is string for query variable
              });
            }
          });
        });

        if (publicMarketIdentifiers.length === 0) {
          return [];
        }

        // 3. Fetch leaderboards for all public markets in parallel
        const leaderboardPromises = publicMarketIdentifiers.map((identifier) =>
          graphqlRequest<MarketLeaderboardQueryResponse>(
            GET_MARKET_LEADERBOARD,
            identifier
          )
        );

        const leaderboardResponses = await Promise.all(leaderboardPromises);

        // 4. Aggregate results (assume all tokens are $1)
        const aggregatedPnL: { [owner: string]: number } = {};

        leaderboardResponses.forEach((response) => {
          if (!response?.getMarketLeaderboard) {
            return;
          }

          const marketLeaderboard = response.getMarketLeaderboard;

          if (marketLeaderboard) {
            // Determine decimals for this market
            const collateralDecimals =
              marketLeaderboard[0]?.collateralDecimals || 18; // Default to 18 if not specified

            marketLeaderboard.forEach((entry) => {
              const { owner, totalPnL: rawPnlString } = entry;

              if (!aggregatedPnL[owner]) {
                aggregatedPnL[owner] = 0;
              }

              // Convert wei string to token amount using actual collateral decimals
              const pnlStringToConvert = rawPnlString || '0';
              const divisor = Math.pow(10, collateralDecimals);
              const pnlTokenAmount = parseFloat(pnlStringToConvert) / divisor;

              // Assume $1 per token
              const pnlUsd = pnlTokenAmount;

              if (Number.isNaN(pnlUsd)) {
                console.error(
                  `Converted PnL USD is NaN for owner ${owner}. Token amount: ${pnlTokenAmount}, collateral: testUSDe`
                );
                return;
              }

              aggregatedPnL[owner] += pnlUsd;
            });
          }
        });

        // 5. Format and Sort
        const finalLeaderboard: AggregatedLeaderboardEntry[] = Object.entries(
          aggregatedPnL
        )
          .map(([owner, totalPnL]) => ({ owner, totalPnL }))
          .sort((a, b) => b.totalPnL - a.totalPnL);

        // Trim to top 10
        return finalLeaderboard.slice(0, 10);
      } catch (error) {
        console.error('Error in useAllTimeLeaderboard:', error);
        return []; // Return empty array on error
      }
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
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
