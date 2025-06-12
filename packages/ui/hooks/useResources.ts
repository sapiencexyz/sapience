import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { foilApi } from '../lib';
import { RESOURCE_ORDER, type ResourceSlug } from '../types/resources';
import { ResourceType, CandleType } from '../types/graphql';

const LATEST_RESOURCE_PRICE_QUERY = gql`
  query GetLatestResourcePrice($slug: String!) {
    resourceCandles(
      slug: $slug
      from: ${Math.floor(Date.now() / 1000) - 300}  # Last 5 minutes
      to: ${Math.floor(Date.now() / 1000)}
      interval: 60  # 1 minute intervals
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const LATEST_INDEX_PRICE_QUERY = gql`
  query GetLatestIndexPrice($address: String!, $chainId: Int!, $epochId: String!) {
    indexCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: ${Math.floor(Date.now() / 1000) - 300}  # Last 5 minutes
      to: ${Math.floor(Date.now() / 1000)}
      interval: 60  # 1 minute intervals
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const RESOURCES_QUERY = gql`
  query GetResources {
    resources {
      id
      name
      slug
      marketGroups {
        id
        address
        isYin
        vaultAddress
        chainId
        markets {
          id
          marketId
          startTimestamp
          endTimestamp
          public
          question
        }
      }
    }
  }
`;

export const useResources = () => {
  return useQuery<(ResourceType & { iconPath: string })[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCES_QUERY),
      });
      const resources = data.resources.sort((a: ResourceType, b: ResourceType) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug as ResourceSlug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug as ResourceSlug);
        return indexA - indexB;
      });

      return resources.map((resource: ResourceType) => ({
        ...resource,
        iconPath: `/resources/${resource.slug}.svg`,
      }));
    },
  });
};

export const useLatestResourcePrice = (slug: string) => {
  return useQuery<{ timestamp: string; value: string }>({
    queryKey: ['resourcePrice', slug],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(LATEST_RESOURCE_PRICE_QUERY),
        variables: {
          slug,
          from: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
          to: Math.floor(Date.now() / 1000),
          interval: 60, // 1 minute intervals
        },
      });

      const candles = data.resourceCandles.data as CandleType[];
      if (!candles || candles.length === 0) {
        throw new Error('No price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: CandleType | null, current: CandleType) => {
        if (!latest || current.timestamp > latest.timestamp) {
          return current;
        }
        return latest;
      }, null);

      if (!latestCandle) {
        throw new Error('No price data found');
      }

      return {
        timestamp: latestCandle.timestamp.toString(),
        value: latestCandle.close,
      };
    },
    refetchInterval: 6000,
  });
};

export const useLatestIndexPrice = (market: {
  address: string;
  chainId: number;
  epochId: number;
}) => {
  return useQuery<{ timestamp: string; value: string } | null>({
    queryKey: [
      'indexPrice',
      `${market.chainId}:${market.address}`,
      market.epochId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.epochId === 0) {
        return null;
      }

      const { data } = await foilApi.post('/graphql', {
        query: print(LATEST_INDEX_PRICE_QUERY),
        variables: {
          address: market.address,
          chainId: market.chainId,
          epochId: market.epochId.toString(),
        },
      });

      const candles = data.indexCandles.data as CandleType[];
      if (!candles || candles.length === 0) {
        throw new Error('No index price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: CandleType | null, current: CandleType) => {
        if (!latest || current.timestamp > latest.timestamp) {
          return current;
        }
        return latest;
      }, null);

      if (!latestCandle) {
        throw new Error('No index price data found');
      }

      return {
        timestamp: latestCandle.timestamp.toString(),
        value: latestCandle.close,
      };
    },
    refetchInterval: 12000, // Refetch every 12 seconds (approx ETH block time)
    enabled: !!market.address && !!market.chainId && market.epochId !== 0,
  });
};
