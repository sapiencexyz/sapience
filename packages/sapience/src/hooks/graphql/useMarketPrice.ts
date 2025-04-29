import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { foilApi } from '~/lib/utils/util';

// --- Constants ---
const WEI_PER_ETHER = 1e18;

// --- GraphQL Query for Market Candles ---
const MARKET_CANDLES_QUERY = gql`
  query GetMarketCandles(
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
      close
      timestamp
    }
  }
`;

// --- Hook to fetch latest market price ---
export function useMarketPrice(
  marketGroupAddress: string | undefined,
  chainId: number | undefined,
  marketId: number | undefined
) {
  const enabled =
    Boolean(marketGroupAddress) && Boolean(chainId) && Boolean(marketId);

  return useQuery<number>({
    // Specify the return type for clarity
    queryKey: ['marketPrice', marketGroupAddress, chainId, marketId],
    queryFn: async () => {
      if (!marketGroupAddress || !chainId || !marketId) {
        return 0; // Return 0 if required parameters are missing
      }

      const to = Math.floor(Date.now() / 1000);
      // Fetch a slightly larger window to increase chance of getting a candle
      const from = to - 600; // 10 minutes ago
      const interval = 60; // 1 minute intervals

      try {
        const { data, errors } = await foilApi.post('/graphql', {
          query: print(MARKET_CANDLES_QUERY),
          variables: {
            address: marketGroupAddress,
            chainId,
            marketId: String(marketId),
            interval,
            from,
            to,
          },
        });

        if (errors) {
          console.error('GraphQL errors fetching market candles:', errors);
          // Consider throwing a more specific error or returning a specific state
          throw new Error(errors[0].message);
        }

        const candles = data?.marketCandles;
        if (candles && candles.length > 0) {
          // Sort by timestamp descending to ensure we get the latest candle
          candles.sort(
            (a: { timestamp: number }, b: { timestamp: number }) =>
              b.timestamp - a.timestamp
          );
          const latestCandle = candles[0];
          return Number(latestCandle.close) / WEI_PER_ETHER;
        }

        console.warn('No recent market candle found for price.', {
          marketGroupAddress,
          chainId,
          marketId,
        });

        return 0;
      } catch (error) {
        console.error('Error in useMarketPrice queryFn:', error);
        // Depending on requirements, could throw error or return default/error state
        return 0; // Return 0 on error
      }
    },
    enabled,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refetch every minute
    placeholderData: 0, // Default price while loading
    // Consider adding error handling state if needed
    // initialData: 0, // Can set an initial default value
  });
}
