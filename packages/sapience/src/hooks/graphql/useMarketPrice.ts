import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import type { CandleType } from '@sapience/ui/types/graphql';

// --- Constants ---
const WEI_PER_ETHER = 1e18;

// --- GraphQL Query for Market Candles ---
const MARKET_CANDLES_QUERY = /* GraphQL */ `
  query MarketCandles(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $interval: Int!
    $from: Int!
    $to: Int!
  ) {
    marketCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
      interval: $interval
      from: $from
      to: $to
    ) {
      data {
        close
        timestamp
      }
      lastUpdateTimestamp
    }
  }
`;

// --- Hook to fetch latest market price ---
export function useMarketPrice(
  marketGroupAddress: string | undefined | null,
  chainId: number | string | undefined | null,
  marketId: number | string | undefined | null
) {
  // Convert chainId and marketId to numbers if they're strings
  const chainIdNumber =
    typeof chainId === 'string' ? parseInt(chainId, 10) || 0 : chainId || 0;
  const marketIdNumber =
    typeof marketId === 'string' ? parseInt(marketId, 10) || 0 : marketId || 0;

  const enabled =
    Boolean(marketGroupAddress) &&
    Boolean(chainIdNumber) &&
    Boolean(marketIdNumber);

  return useQuery<number>({
    queryKey: [
      'marketPrice',
      marketGroupAddress,
      chainIdNumber,
      marketIdNumber,
    ],
    queryFn: async () => {
      if (!marketGroupAddress || !chainIdNumber || !marketIdNumber) {
        return 0; // Return 0 if required parameters are missing
      }

      const to = Math.floor(Date.now() / 1000);
      // Fetch a slightly larger window to increase chance of getting a candle
      const from = to - 600; // 10 minutes ago
      const interval = 60; // 1 minute intervals

      try {
        type MarketCandlesQueryResult = {
          marketCandles: {
            data: CandleType[];
            lastUpdateTimestamp: number;
          };
        };

        const data = await graphqlRequest<MarketCandlesQueryResult>(
          MARKET_CANDLES_QUERY,
          {
            address: marketGroupAddress,
            chainId: chainIdNumber,
            marketId: String(marketIdNumber),
            interval,
            from,
            to,
          }
        );

        const candles = data?.marketCandles?.data;
        if (candles && candles.length > 0) {
          // Sort by timestamp descending to ensure we get the latest candle
          candles.sort(
            (a: CandleType, b: CandleType) => b.timestamp - a.timestamp
          );
          const latestCandle = candles[0];
          return Number(latestCandle.close) / WEI_PER_ETHER;
        }

        console.warn('No recent market candle found for price.', {
          marketGroupAddress,
          chainId: chainIdNumber,
          marketId: marketIdNumber,
        });

        return 0;
      } catch (error) {
        console.error('Error in useMarketPrice queryFn:', error);
        return 0; // Return 0 on error
      }
    },
    enabled,
    staleTime: 15000, // 15 seconds
    refetchInterval: 15000, // Refetch every 15 seconds
    placeholderData: 0, // Default price while loading
  });
}
