import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import { API_BASE_URL } from '~/lib/constants/constants';
import type { Market, Epoch } from '~/lib/types';
import { gweiToEther, convertToSqrtPriceX96 } from '~/lib/utils/util';

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
      const response = await fetch(
        `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${market.chainId}&endTime=${epoch.endTimestamp}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch stEthPerToken');
      }
      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(INDEX_PRICE_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            epochId: epoch.epochId.toString(),
            timestamp: epoch.endTimestamp,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const { data } = await response.json();
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
