import { useQuery } from '@tanstack/react-query';

import { graphqlRequest } from '../lib';
import { RESOURCE_ORDER, type ResourceSlug } from '../types/resources';
import type { CandleType, Resource, CandleAndTimestampType } from '../types/graphql';

// Query response types
interface GetResourcesQuery {
  resources: Resource[];
}

interface GetResourceCandlesQuery {
  resourceCandles: CandleAndTimestampType;
}

interface GetIndexCandlesQuery {
  indexCandles: CandleAndTimestampType;
}

const LATEST_RESOURCE_PRICE_QUERY = /* GraphQL */ `
  query LatestResourcePrice($slug: String!, $from: Int!, $to: Int!, $interval: Int!) {
    resourceCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const LATEST_INDEX_PRICE_QUERY = /* GraphQL */ `
  query LatestIndexPrice($address: String!, $chainId: Int!, $marketId: String!, $from: Int!, $to: Int!, $interval: Int!) {
    indexCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const RESOURCES_QUERY = /* GraphQL */ `
  query Resources {
    resources {
      id
      name
      slug
      marketGroups {
        id
        address
        isBridged
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
  return useQuery<(GetResourcesQuery['resources'][0] & { iconPath: string })[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const data = await graphqlRequest<GetResourcesQuery>(RESOURCES_QUERY);
      
      const resources = data.resources.sort((a, b) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug as ResourceSlug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug as ResourceSlug);
        return indexA - indexB;
      });

      return resources.map((resource) => ({
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
      const from = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
      const to = Math.floor(Date.now() / 1000);
      const interval = 60; // 1 minute intervals

      const data = await graphqlRequest<GetResourceCandlesQuery>(
        LATEST_RESOURCE_PRICE_QUERY,
        { slug, from, to, interval }
      );

      const candles = data.resourceCandles.data;
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
    refetchInterval: 15000, // Match candle cache interval
  });
};

export const useLatestIndexPrice = (market: {
  address: string;
  chainId: number;
  marketId: number;
}) => {
  return useQuery<{ timestamp: string; value: string } | null>({
    queryKey: [
      'indexPrice',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      const from = Math.floor(Date.now() / 1000) - 300; // Last 5 minutes
      const to = Math.floor(Date.now() / 1000);
      const interval = 60; // 1 minute intervals

      const data = await graphqlRequest<GetIndexCandlesQuery>(
        LATEST_INDEX_PRICE_QUERY,
        {
          address: market.address,
          chainId: market.chainId,
          marketId: market.marketId.toString(),
          from,
          to,
          interval,
        }
      );

      const candles = data.indexCandles.data;
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
    refetchInterval: 15000, 
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
  });
};
