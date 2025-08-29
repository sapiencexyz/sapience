import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';

import { foilApi } from '~/lib/utils/util';

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
const useAllTimeLeaderboard = (cryptoPrices: any) => {
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

        // 4. Aggregate results (need to convert to USD for each market's collateral)
        const aggregatedPnL: { [owner: string]: number } = {};

        leaderboardResponses.forEach((response) => {
          if (!response?.getMarketLeaderboard) {
            return;
          }

          const marketLeaderboard = response.getMarketLeaderboard;

          if (marketLeaderboard) {
            // Get collateral info for this market
            const collateralAddress = marketLeaderboard[0]?.collateralAddress;
            const collateralSymbol = marketLeaderboard[0]?.collateralSymbol;
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

              // Determine USD value based on collateral
              let pnlUsd: number;
              if (
                collateralAddress?.toLowerCase() ===
                '0xeedd0ed0e6cc8adc290189236d9645393ae54bc3'
              ) {
                // testUSDe is always $1
                pnlUsd = pnlTokenAmount * 1.0;
              } else {
                // For other tokens, try to get price from crypto prices API
                let tokenPrice = null;
                if (collateralSymbol?.toLowerCase() === 'eth') {
                  tokenPrice = cryptoPrices?.ethereum?.usd;
                } else if (collateralSymbol?.toLowerCase() === 'btc') {
                  tokenPrice = cryptoPrices?.bitcoin?.usd;
                } else if (collateralSymbol?.toLowerCase() === 'sol') {
                  tokenPrice = cryptoPrices?.solana?.usd;
                } else if (collateralSymbol?.toLowerCase() === 'susde') {
                  tokenPrice = cryptoPrices?.susde?.usd;
                }

                pnlUsd = tokenPrice
                  ? pnlTokenAmount * tokenPrice
                  : pnlTokenAmount;
              }

              if (Number.isNaN(pnlUsd)) {
                console.error(
                  `Converted PnL USD is NaN for owner ${owner}. Token amount: ${pnlTokenAmount}, collateral: ${collateralSymbol}`
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

// Query hook for crypto prices
const useCryptoPrices = () => {
  return useQuery({
    queryKey: ['cryptoPrices'],
    queryFn: async () => {
      try {
        const response = await foilApi.get('/crypto-prices');

        // The response itself is the data object, not response.data
        const prices = {
          ethereum: { usd: response?.eth ?? null },
          bitcoin: { usd: response?.btc ?? null },
          solana: { usd: response?.sol ?? null },
          testusde: { usd: response?.testusde ?? null },
        };
        // Ensure prices are numbers or null
        prices.ethereum.usd =
          prices.ethereum.usd !== null ? Number(prices.ethereum.usd) : null;
        prices.bitcoin.usd =
          prices.bitcoin.usd !== null ? Number(prices.bitcoin.usd) : null;
        prices.solana.usd =
          prices.solana.usd !== null ? Number(prices.solana.usd) : null;
        prices.testusde.usd =
          prices.testusde.usd !== null ? Number(prices.testusde.usd) : null;

        // Check for NaN explicitly after conversion
        if (Number.isNaN(prices.ethereum.usd as number)) {
          console.warn(
            'Ethereum price is NaN after conversion. API response:',
            response?.eth
          );
          prices.ethereum.usd = null; // Fallback to null if NaN
        }
        if (Number.isNaN(prices.bitcoin.usd as number)) {
          console.warn(
            'Bitcoin price is NaN after conversion. API response:',
            response?.btc
          );
          prices.bitcoin.usd = null;
        }
        if (Number.isNaN(prices.solana.usd as number)) {
          console.warn(
            'Solana price is NaN after conversion. API response:',
            response?.sol
          );
          prices.solana.usd = null;
        }
        if (Number.isNaN(prices.testusde.usd as number)) {
          console.warn(
            'testUSDe price is NaN after conversion. API response:',
            response?.testusde
          );
          prices.testusde.usd = null;
        }

        return prices;
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        return {
          ethereum: { usd: null },
          bitcoin: { usd: null },
          solana: { usd: null },
          testusde: { usd: null },
        };
      }
    },
    staleTime: 60 * 1000, // 1 minute
  });
};

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
  const { data: cryptoPrices } = useCryptoPrices();
  const { data: leaderboardData, isLoading } =
    useAllTimeLeaderboard(cryptoPrices);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  return {
    leaderboardData,
    isLoading,
    cryptoPrices,
    selectedTimeframe,
    setSelectedTimeframe,
  };
};

// Export the interface for use in the component
export type { AggregatedLeaderboardEntry };
