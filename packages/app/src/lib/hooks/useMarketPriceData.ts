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
  const isActive = now < endTimestamp;

  // If the market is active, use the current time minus a 60-second buffer
  // for fetching estimates, otherwise use the actual endTimestamp.
  // This might help if the backend has slight delays indexing the absolute latest data.
  const timestamp = isActive ? Math.max(0, now - 60) : endTimestamp;

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
      queryKey: ['stEthPerToken', chainId, timestamp],
      queryFn: async () => {
        if (!isEthereumResource) return currentStEthPerToken || 1;

        const data = await foilApi.get(
          `/getStEthPerTokenAtTimestamps?chainId=${chainId}&endTime=${timestamp}`
        );
        return Number(formatEther(BigInt(data.stEthPerToken)));
      },
      enabled: !!isEthereumResource && !!chainId && !!timestamp,
    });

  const {
    data,
    isLoading: isPriceLoading,
    error,
  } = useQuery({
    queryKey: [
      'marketPriceData',
      `${chainId}:${marketAddress}`,
      epochId,
      timestamp,
    ],
    queryFn: async () => {
      if (!marketAddress || !chainId || !epochId || !timestamp) {
        return null;
      }

      const response = await foilApi.post('/graphql', {
        query: print(INDEX_PRICE_AT_TIME_QUERY),
        variables: {
          address: marketAddress,
          chainId,
          epochId: epochId.toString(),
          timestamp,
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
    enabled: !!marketAddress && !!chainId && !!epochId && !!timestamp,
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
