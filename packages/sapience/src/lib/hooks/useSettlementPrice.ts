import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import type { Market, Epoch } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96, foilApi } from '~/lib/utils/util';

const INDEX_CANDLES_QUERY = gql`
  query GetIndexCandles(
    $address: String!
    $chainId: Int!
    $epochId: String!
    $timestamp: Int!
  ) {
    indexCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $timestamp
      to: $timestamp
      interval: 60
    ) {
      timestamp
      close
    }
  }
`;

export function useSettlementPrice(market: Market, epoch: Epoch) {
  const { data: stEthPerToken = 0, isLoading: isStEthLoading } = useQuery({
    queryKey: ['stEthPerToken', market.chainId, epoch.endTimestamp],
    queryFn: async () => {
      const data = await foilApi.get(
        `/getStEthPerTokenAtTimestamps?chainId=${market.chainId}&endTime=${epoch.endTimestamp}`
      );
      return Number(formatEther(BigInt(data.stEthPerToken)));
    },
    enabled: !!market.chainId && !!epoch.endTimestamp,
  });

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: [
      'latestPrice',
      `${market?.chainId}:${market?.address}`,
      epoch.epochId,
      epoch.endTimestamp,
    ],
    queryFn: async () => {
      const response = await foilApi.post('/graphql', {
        query: print(INDEX_CANDLES_QUERY),
        variables: {
          address: market.address,
          chainId: market.chainId,
          epochId: epoch.epochId.toString(),
          timestamp: epoch.endTimestamp,
        },
      });

      const candles = response.data?.indexCandles;
      if (!candles || candles.length === 0) {
        throw new Error('No index price data found');
      }

      return Number(gweiToEther(BigInt(candles[0].close)));
    },
    enabled: epoch.epochId !== 0 && !!market && !!epoch.endTimestamp,
  });

  const priceAdjusted = (latestPrice ?? 0) / (stEthPerToken || 1);

  const sqrtPriceX96 = convertToSqrtPriceX96(priceAdjusted);

  return {
    latestPrice,
    stEthPerToken,
    priceAdjusted,
    sqrtPriceX96,
    isLoading: isStEthLoading || isLatestPriceLoading,
  };
}
