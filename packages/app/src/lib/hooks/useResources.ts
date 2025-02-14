import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { RESOURCES } from '~/lib/constants/resources';
import { foilApi } from '~/lib/utils/util';

export interface Epoch {
  id: number;
  epochId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
}

export interface Market {
  id: number;
  address: string;
  chainId: number;
  name: string;
  vaultAddress: string;
  isYin: boolean;
  epochs: Epoch[];
}

export interface Resource {
  id: number;
  name: string;
  slug: string;
  iconPath: string;
  markets: Market[];
}

const LATEST_RESOURCE_PRICE_QUERY = gql`
  query GetLatestResourcePrice($slug: String!) {
    resourceCandles(
      slug: $slug
      from: ${Math.floor(Date.now() / 1000) - 300}  # Last 5 minutes
      to: ${Math.floor(Date.now() / 1000)}
      interval: 60  # 1 minute intervals
    ) {
      timestamp
      close
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
      timestamp
      close
    }
  }
`;

const RESOURCES_QUERY = gql`
  query GetResources {
    resources {
      id
      name
      slug
      markets {
        id
        address
        isYin
        vaultAddress
        chainId
        epochs {
          id
          epochId
          startTimestamp
          endTimestamp
          settled
        }
      }
    }
  }
`;

export const useResources = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCES_QUERY),
      });

      // Create a map of resource data from the API by name
      const resourceMap = new Map(
        data.resources.map((r: Omit<Resource, 'iconPath'>) => [r.name, r])
      );

      // Merge with RESOURCES constant maintaining its order
      return RESOURCES.map((resourceConstant) => {
        const apiResource = resourceMap.get(resourceConstant.name);
        if (!apiResource) return null;

        return {
          ...apiResource,
          iconPath: resourceConstant.iconPath,
        };
      }).filter((r): r is Resource => r !== null);
    },
  });
};

export const useLatestResourcePrice = (slug: string) => {
  return useQuery({
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

      const candles = data.resourceCandles;
      if (!candles || candles.length === 0) {
        throw new Error('No price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: any, current: any) => {
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
  return useQuery({
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

      const candles = data.indexCandles;
      if (!candles || candles.length === 0) {
        throw new Error('No index price data found');
      }

      // Find the latest candle by timestamp
      const latestCandle = candles.reduce((latest: any, current: any) => {
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
