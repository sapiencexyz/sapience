import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { API_BASE_URL } from '~/lib/constants/constants';

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

const mapResourceToIconPath = (name: string): string => {
  switch (name) {
    case 'Ethereum Gas':
      return '/eth.svg';
    case 'Celestia Blobspace':
      return '/tia.svg';
    default:
      return '';
  }
};

export const useResources = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/resources`);
      const data = await response.json();
      return data.map((resource: Omit<Resource, 'iconPath'>) => ({
        ...resource,
        iconPath: mapResourceToIconPath(resource.name),
      }));
    },
  });
};

export const useLatestResourcePrice = (slug: string) => {
  return useQuery({
    queryKey: ['resourcePrice', slug],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(LATEST_RESOURCE_PRICE_QUERY),
          variables: {
            slug,
            from: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
            to: Math.floor(Date.now() / 1000),
            interval: 60, // 1 minute intervals
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch latest price');
      }

      const { data } = await response.json();
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
    refetchInterval: 12000, // Refetch every 12 seconds (approx ETH block time)
  });
};

export const useLatestIndexPrice = (market: { address: string; chainId: number; epochId: number }) => {
  return useQuery({
    queryKey: ['indexPrice', `${market.chainId}:${market.address}`, market.epochId],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.epochId === 0) {
        return null;
      }

      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(LATEST_INDEX_PRICE_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            epochId: market.epochId.toString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch latest index price');
      }

      const { data } = await response.json();
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
