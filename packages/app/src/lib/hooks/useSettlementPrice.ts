import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import type { Market, Epoch } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96, foilApi } from '~/lib/utils/util';

const INDEX_PRICE_QUERY = gql`
  query GetIndexPrice(
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

export function useSettlementPrice(market: Market, epoch: Epoch) {
  const { data: stEthPerToken = 0, isLoading: isStEthLoading } = useQuery({
    queryKey: ['stEthPerToken', market.chainId, epoch.endTimestamp],
    queryFn: async () => {
      const data = await foilApi.get(
        `/getStEthPerTokenAtTimestamp?chainId=${market.chainId}&endTime=${epoch.endTimestamp}`
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
      const data = await foilApi.post('/graphql', {
        query: print(INDEX_PRICE_QUERY),
        variables: {
          address: market.address,
          chainId: market.chainId,
          epochId: epoch.epochId.toString(),
          timestamp: epoch.endTimestamp,
        },
      });

      const price = data.indexPriceAtTime;
      if (!price) {
        throw new Error('No index price data found');
      }

      return Number(gweiToEther(BigInt(price.close)));
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
