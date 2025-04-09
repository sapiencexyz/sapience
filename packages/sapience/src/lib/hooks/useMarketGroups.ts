import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { RESOURCE_ORDER, type ResourceSlug } from '~/lib/constants/resources';
import { foilApi } from '~/lib/utils/util';

export interface Epoch {
  id: number;
  epochId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
  public: boolean;
  question: string | null;
  totalLiquidity: number;
  totalVolume: number;
  collateralTicker: string;
  minTick: number;
  maxTick: number;
  currentMarketPrice: number;
  marketCandles: any[];
}

export interface Market {
  id: number;
  address: string;
  chainId: number;
  name: string;
  vaultAddress: string;
  isYin: boolean;
  collateralAsset: string;
  epochs: Epoch[];
}

export interface Resource {
  id: number;
  name: string;
  slug: ResourceSlug;
  iconPath: string;
  markets: Market[];
}

export interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
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
        collateralAsset
        epochs {
          id
          epochId
          startTimestamp
          endTimestamp
          settled
          public
          question
        }
      }
    }
  }
`;

const MARKET_CANDLES_QUERY = gql`
  query GetMarketCandles($address: String!, $chainId: Int!, $epochId: String!, $from: Int!, $to: Int!, $interval: Int!) {
    marketCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $from
      to: $to
      interval: $interval
    ) {
      timestamp
      open
      high
      low
      close
    }
  }
`;

const TOTAL_VOLUME_QUERY = gql`
  query GetTotalVolume($marketAddress: String!, $chainId: Int!, $epochId: Int!) {
    totalVolumeByEpoch(
      marketAddress: $marketAddress
      chainId: $chainId
      epochId: $epochId
    )
  }
`;

export const useMarketGroups = () => {
  return useQuery<Resource[]>({
    queryKey: ['resources'],
    queryFn: async () => {
      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCES_QUERY),
      });
      const resourcesWithMarketNames = data.resources.map((resource: any) => ({
        ...resource,
        markets: resource.markets.map((market: any) => ({
            ...market,
            name: resource.name
        }))
      }));

      const sortedResources = resourcesWithMarketNames.sort((a: any, b: any) => {
        const indexA = RESOURCE_ORDER.indexOf(a.slug);
        const indexB = RESOURCE_ORDER.indexOf(b.slug);
        return indexA - indexB;
      });

      return sortedResources.map((resource: any) => ({
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
          from: Math.floor(Date.now() / 1000) - 300,
          to: Math.floor(Date.now() / 1000),
          interval: 60,
        },
      });

      const candles = data.resourceCandles;
      if (!candles || candles.length === 0) {
        return { timestamp: null, value: null };
      }

      const latestCandle = candles.reduce((latest: any, current: any) => {
        return (!latest || current.timestamp > latest.timestamp) ? current : latest;
      }, null);

      if (!latestCandle) {
         return { timestamp: null, value: null };
      }

      return {
        timestamp: latestCandle.timestamp.toString(),
        value: latestCandle.close,
      };
    },
    refetchInterval: 6000,
    enabled: !!slug,
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
        return { timestamp: null, value: null };
      }

      try {
         const { data } = await foilApi.post('/graphql', {
          query: print(LATEST_INDEX_PRICE_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            epochId: market.epochId.toString(),
            from: Math.floor(Date.now() / 1000) - 300,
            to: Math.floor(Date.now() / 1000),
            interval: 60,
          },
        });

        const candles = data.indexCandles;
        if (!candles || candles.length === 0) {
           return { timestamp: null, value: null };
        }

        const latestCandle = candles.reduce((latest: any, current: any) => {
           return (!latest || current.timestamp > latest.timestamp) ? current : latest;
        }, null);

        if (!latestCandle) {
           return { timestamp: null, value: null };
        }

        return {
          timestamp: latestCandle.timestamp.toString(),
          value: latestCandle.close,
        };
      } catch (error) {
         console.error("Error fetching latest index price:", error);
         return { timestamp: null, value: null };
      }
    },
    refetchInterval: 12000,
    enabled: !!market.address && !!market.chainId && market.epochId !== 0,
  });
};

export const useMarketCandles = (market: {
  address: string;
  chainId: number;
  epochId: number;
}) => {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 7 * 24 * 60 * 60;
  const to = now;
  const interval = 3600;

  return useQuery<Candle[] | null>({
    queryKey: [
      'marketCandles',
      `${market.chainId}:${market.address}`,
      market.epochId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.epochId === 0) {
        return null;
      }

      try {
        const { data } = await foilApi.post('/graphql', {
          query: print(MARKET_CANDLES_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            epochId: market.epochId.toString(),
            from,
            to,
            interval,
          },
        });
        return data.marketCandles || [];
      } catch (error) {
        console.error("Error fetching market candles:", error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.epochId !== 0,
    refetchInterval: 60000,
  });
};

export const useTotalVolume = (market: {
  address: string;
  chainId: number;
  epochId: number;
}) => {
  return useQuery<number | null>({
    queryKey: [
      'totalVolume',
      `${market.chainId}:${market.address}`,
      market.epochId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.epochId === 0) {
        return null;
      }

      try {
        const { data } = await foilApi.post('/graphql', {
          query: print(TOTAL_VOLUME_QUERY),
          variables: {
            marketAddress: market.address,
            chainId: market.chainId,
            epochId: market.epochId,
          },
        });
        return data.totalVolumeByEpoch;
      } catch (error) {
        console.error("Error fetching total volume:", error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.epochId !== 0,
    refetchInterval: 60000,
  });
};

export const getLatestPriceFromCandles = (candles: Candle[] | null | undefined): number | null => {
  if (!candles || candles.length === 0) {
    return null;
  }
  const latestCandle = candles.reduce((latest, current) => {
    return (!latest || current.timestamp > latest.timestamp) ? current : latest;
  });
  const price = parseFloat(latestCandle.close);
  return isNaN(price) ? null : price;
};
