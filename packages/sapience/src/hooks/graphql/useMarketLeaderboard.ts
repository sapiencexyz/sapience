import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';

// No REST dependencies; all tokens assumed to be worth $1.

export interface MarketLeaderboardEntry {
  owner: string;
  totalPnL: number;
  collateralAddress?: string;
  collateralSymbol?: string;
  collateralDecimals?: number;
}

interface RawMarketLeaderboardEntry {
  marketId: number;
  owner: string;
  totalPnL: string;
  openPositionsPnL: string;
  totalDeposits: string;
  totalWithdrawals: string;
  positionCount: number;
  collateralAddress?: string;
  collateralSymbol?: string;
  collateralDecimals?: number;
}

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
      marketId
      owner
      totalPnL
      openPositionsPnL
      totalDeposits
      totalWithdrawals
      positionCount
      collateralAddress
      collateralSymbol
      collateralDecimals
    }
  }
`;

// Type definition for GraphQL response
type MarketLeaderboardQueryResponse = {
  getMarketLeaderboard: RawMarketLeaderboardEntry[];
};

// Removed crypto prices; $1 assumption used.

// Removed stETH conversion; $1 assumption used.

export const useMarketLeaderboard = (
  marketAddress: string | null,
  chainId: number | null,
  marketId: string | null
) => {
  const leaderboardQuery = useQuery<MarketLeaderboardEntry[]>({
    queryKey: ['marketLeaderboard', marketAddress, chainId, marketId],
    queryFn: async () => {
      if (!marketAddress || !chainId || !marketId) {
        return [];
      }

      try {
        const data = await graphqlRequest<MarketLeaderboardQueryResponse>(
          GET_MARKET_LEADERBOARD,
          {
            chainId,
            address: marketAddress,
            marketId: String(marketId),
          }
        );

        const rawData = data?.getMarketLeaderboard || [];

        console.log(`[useMarketLeaderboard DEBUG] Raw GraphQL data:`, rawData);

        const processedData: MarketLeaderboardEntry[] = rawData
          .map((entry) => {
            try {
              const pnlString = entry.totalPnL || '0';
              const collateralDecimals = entry.collateralDecimals || 18; // Default to 18 if not specified
              const divisor = Math.pow(10, collateralDecimals);
              const pnlNumber = parseFloat(pnlString) / divisor;

              if (Number.isNaN(pnlNumber)) {
                return null;
              }

              return {
                owner: entry.owner,
                totalPnL: pnlNumber,
                collateralAddress: entry.collateralAddress,
                collateralSymbol: entry.collateralSymbol,
                collateralDecimals: entry.collateralDecimals,
              } as MarketLeaderboardEntry;
            } catch (error) {
              console.error(
                `Error processing entry for owner ${entry.owner}:`,
                error
              );
              return null;
            }
          })
          .filter((entry): entry is MarketLeaderboardEntry => entry !== null)
          .sort((a, b) => b.totalPnL - a.totalPnL);

        console.log(
          `[useMarketLeaderboard DEBUG] Processed data:`,
          processedData
        );
        return processedData.slice(0, 10);
      } catch (error) {
        console.error('Error in useMarketLeaderboard:', error);
        return [];
      }
    },
    enabled: Boolean(marketAddress && chainId && marketId),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return {
    leaderboardData: leaderboardQuery.data,
    isLoading: leaderboardQuery.isLoading,
    error: leaderboardQuery.error,
  };
};
