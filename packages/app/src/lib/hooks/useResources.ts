import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { RESOURCE_ORDER, type ResourceSlug } from '~/lib/constants/resources';
import { foilApi } from '~/lib/utils/util';

export interface Market {
  id: number;
  marketId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
  public: boolean;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
}

export interface MarketGroup {
  id: number;
  address: string;
  chainId: number;
  name: string;
  vaultAddress: string;
  isYin: boolean;
  isCumulative: boolean;
  markets: Market[];
  category: Category;
}

export interface Resource {
  id: number;
  name: string;
  slug: ResourceSlug;
  iconPath: string;
  marketGroups: MarketGroup[];
  category: Category;
}

const RESOURCE_BITCOIN_HASH_SLUG = 'bitcoin-hashrate';

const DECENTRALIZED_COMPUTE_CATEGORY_SLUG = 'decentralized-compute';

const LATEST_RESOURCE_PRICE_QUERY = gql`
  query GetLatestResourcePrice(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    resourceCandles(slug: $slug, from: $from, to: $to, interval: $interval) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const LATEST_INDEX_PRICE_QUERY = gql`
  query GetLatestIndexPrice($address: String!, $chainId: Int!, $marketId: String!) {
    indexCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
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
  query GetResources($categorySlug: String) {
    resources(categorySlug: $categorySlug) {
      id
      name
      slug
      category {
        id
        slug
        name
      }
      marketGroups {
        id
        address
        isYin
        isCumulative
        vaultAddress
        chainId
        category {
          id
          slug
          name
        }
        markets {
          id
          marketId
          startTimestamp
          endTimestamp
          settled
          public
        }
      }
    }
  }
`;

export const useResources = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources', { category: DECENTRALIZED_COMPUTE_CATEGORY_SLUG }],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCES_QUERY),
        variables: {
          categorySlug: DECENTRALIZED_COMPUTE_CATEGORY_SLUG,
        },
      });
      const resources = data.resources.sort((a: Resource, b: Resource) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug);
        return indexA - indexB;
      });
      return resources.map((resource: Resource) => ({
        ...resource,
        iconPath: `/resources/${resource.slug}.svg`,
        marketGroups: resource.marketGroups.filter(
          (marketGroup: MarketGroup) =>
            marketGroup.category?.slug === DECENTRALIZED_COMPUTE_CATEGORY_SLUG
        ),
      }));
    },
  });
};

export const useResourcesAdmin = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources', 'admin'],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCES_QUERY),
      });
      const resources = data.resources.sort((a: Resource, b: Resource) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug);
        return indexA - indexB;
      });
      return resources.map((resource: Resource) => ({
        ...resource,
        iconPath: `/resources/${resource.slug}.svg`,
      }));
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
          from:
            Math.floor(Date.now() / 1000) -
            (slug === RESOURCE_BITCOIN_HASH_SLUG ? 60 * 60 : 5 * 60), // last 24 hours vs last 5 minutes
          to: Math.floor(Date.now() / 1000),
          interval: 60, // 1 minute intervals
        },
      });

      const candles = data.resourceCandles.data;
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
  marketId: number;
}) => {
  return useQuery({
    queryKey: [
      'indexPrice',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      const { data } = await foilApi.post('/graphql', {
        query: print(LATEST_INDEX_PRICE_QUERY),
        variables: {
          address: market.address,
          chainId: market.chainId,
          marketId: market.marketId.toString(),
        },
      });

      const candles = data.indexCandles.data;
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
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
  });
};
