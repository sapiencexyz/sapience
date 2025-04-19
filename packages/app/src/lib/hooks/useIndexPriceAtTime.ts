import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { foilApi, gweiToEther } from '~/lib/utils/util';

const INDEX_PRICE_AT_TIME_QUERY = gql`
  query IndexPriceAtTime(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $timestamp: Int!
  ) {
    indexPriceAtTime(
      address: $address
      chainId: $chainId
      marketId: $marketId
      timestamp: $timestamp
    ) {
      timestamp
      close
    }
  }
`;

export function useIndexPriceAtTime(
  marketAddress: string,
  chainId: number,
  marketId: number,
  timestamp: number
) {
  const { data, isLoading, error } = useQuery({
    queryKey: [
      'indexPriceAtTime',
      `${chainId}:${marketAddress}`,
      marketId,
      timestamp,
    ],
    queryFn: async () => {
      if (!marketAddress || !chainId || !marketId || !timestamp) {
        return null;
      }

      const response = await foilApi.post('/graphql', {
        query: print(INDEX_PRICE_AT_TIME_QUERY),
        variables: {
          address: marketAddress,
          chainId,
          marketId: marketId.toString(),
          timestamp,
        },
      });

      const priceData = response.data?.indexPriceAtTime;
      if (!priceData) {
        return null;
      }

      return {
        timestamp: priceData.timestamp,
        value: Number(gweiToEther(BigInt(priceData.close))),
      };
    },
    enabled: !!marketAddress && !!chainId && !!marketId && !!timestamp,
  });

  return {
    indexPrice: data?.value,
    timestamp: data?.timestamp,
    isLoading,
    error,
  };
}
