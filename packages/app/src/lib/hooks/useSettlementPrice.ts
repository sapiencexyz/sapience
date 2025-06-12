import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import type { MarketGroup, Market } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96, foilApi } from '~/lib/utils/util';

const INDEX_CANDLES_QUERY = gql`
  query GetIndexCandles(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $timestamp: Int!
  ) {
    indexCandlesFromCache(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $timestamp
      to: $timestamp
      interval: 60
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

export function useSettlementPrice(marketGroup: MarketGroup, market: Market) {
  const { data: stEthPerToken = 0, isLoading: isStEthLoading } = useQuery({
    queryKey: ['stEthPerToken', marketGroup.chainId, market.endTimestamp],
    queryFn: async () => {
      const data = await foilApi.get(
        `/getStEthPerTokenAtTimestamps?chainId=${marketGroup.chainId}&endTime=${market.endTimestamp}`
      );
      return Number(formatEther(BigInt(data.stEthPerToken)));
    },
    enabled: !!marketGroup.chainId && !!market.endTimestamp,
  });

  const { data: latestPrice, isLoading: isLatestPriceLoading } = useQuery({
    queryKey: [
      'latestPrice',
      `${marketGroup?.chainId}:${marketGroup?.address}`,
      market.marketId,
      market.endTimestamp,
    ],
    queryFn: async () => {
      const response = await foilApi.post('/graphql', {
        query: print(INDEX_CANDLES_QUERY),
        variables: {
          address: marketGroup.address,
          chainId: marketGroup.chainId,
          marketId: market.marketId.toString(),
          timestamp: market.endTimestamp,
        },
      });

      const candles = response.data?.indexCandlesFromCache?.data;
      if (!candles || candles.length === 0) {
        throw new Error('No index price data found');
      }

      return Number(gweiToEther(BigInt(candles[0].close)));
    },
    enabled: market.marketId !== 0 && !!marketGroup && !!market.endTimestamp,
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
