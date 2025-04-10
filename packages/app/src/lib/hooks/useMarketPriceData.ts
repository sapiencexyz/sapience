import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import { useFoil } from '~/lib/context/FoilProvider';
import { foilApi, gweiToEther, convertToSqrtPriceX96 } from '~/lib/utils/util';

import { useResources } from './useResources';

const INDEX_PRICE_AT_TIME_QUERY = gql`
  query IndexPriceAtTime(
    $address: String!
    $chainId: Int!
    $epochId: String!
    $timestamp: Int!
  ) {
    indexPriceAtTime(
      address: $address
      chainId: $chainId
      epochId: $epochId
      timestamp: $timestamp
    ) {
      timestamp
      close
    }
  }
`;

export function useMarketPriceData(
  marketAddress: string,
  chainId: number,
  epochId: number,
  endTimestamp: number
) {
  const now = Math.floor(Date.now() / 1000);
  // Determine if the market is active *before* calculating the timestamp
  const isActive = now < endTimestamp;
  // Use (current time - 60 seconds) if active, otherwise use current time
  const timestampToUse = isActive ? now - 60 : now;
  // Use the lesser of the calculated time (or now-60) and the end time.
  // This ensures settled markets still use endTimestamp.
  // Rename this timestamp as it's used for the API call.
  const timestampForApi = Math.min(timestampToUse, endTimestamp);

  // Calculate a stable timestamp for the queryKey when the market is active.
  // Round down to the nearest 5 minutes (300 seconds) to prevent rapid key changes.
  const queryKeyTimestampInterval = 300;
  const timestampForKey = isActive
    ? Math.floor(timestampForApi / queryKeyTimestampInterval) *
      queryKeyTimestampInterval
    : timestampForApi; // Use the precise timestamp for the key if not active

  const { stEthPerToken: currentStEthPerToken } = useFoil();
  const { data: resources } = useResources();

  // Find the resource for this market
  const resource = resources?.find((r) =>
    r.markets.some((m) => m.address === marketAddress && m.chainId === chainId)
  );

  // Check if the resource name includes "Ethereum"
  const isEthereumResource = resource?.name?.includes('Ethereum');

  // Fetch historical stEthPerToken if it's an Ethereum resource
  const { data: historicalStEthPerToken = 0, isLoading: isStEthLoading } =
    useQuery({
      // Use the stabilized timestamp in the query key
      queryKey: ['stEthPerToken', chainId, timestampForKey],
      queryFn: async () => {
        if (!isEthereumResource) return currentStEthPerToken || 1;

        const data = await foilApi.get(
          // Use the potentially more precise timestamp for the API call
          `/getStEthPerTokenAtTimestamps?chainId=${chainId}&endTime=${timestampForApi}`
        );
        return Number(formatEther(BigInt(data.stEthPerToken)));
      },
      // Use the API timestamp for the enabled check
      enabled: !!isEthereumResource && !!chainId && !!timestampForApi,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });

  const {
    data,
    isLoading: isPriceLoading,
    error,
  } = useQuery({
    // Use the stabilized timestamp in the query key
    queryKey: [
      'marketPriceData',
      `${chainId}:${marketAddress}`,
      epochId,
      timestampForKey,
    ],
    queryFn: async () => {
      // Use the API timestamp for the enabled check
      if (!marketAddress || !chainId || !epochId || !timestampForApi) {
        return null;
      }

      const response = await foilApi.post('/graphql', {
        query: print(INDEX_PRICE_AT_TIME_QUERY),
        variables: {
          address: marketAddress,
          chainId,
          epochId: epochId.toString(),
          timestamp: timestampForApi,
        },
      });

      const priceData = response.data?.indexPriceAtTime;
      if (!priceData) {
        return null;
      }

      const indexPrice = Number(gweiToEther(BigInt(priceData.close)));

      // Calculate adjusted price based on resource type
      const adjustedPrice = isEthereumResource
        ? indexPrice / (historicalStEthPerToken || 1)
        : indexPrice;

      // Calculate sqrtPriceX96 from adjusted price
      const sqrtPriceX96 = convertToSqrtPriceX96(adjustedPrice);

      return {
        timestamp: priceData.timestamp,
        indexPrice,
        adjustedPrice,
        sqrtPriceX96,
        isEthereumResource,
      };
    },
    // Use the API timestamp for the enabled check
    enabled: !!marketAddress && !!chainId && !!epochId && !!timestampForApi,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const isLoading = isPriceLoading || isStEthLoading;

  return {
    indexPrice: data?.indexPrice,
    adjustedPrice: data?.adjustedPrice,
    sqrtPriceX96: data?.sqrtPriceX96,
    isEthereumResource: data?.isEthereumResource,
    stEthPerToken: historicalStEthPerToken,
    timestamp: data?.timestamp,
    isLoading,
    error,
    isActive,
  };
}
