import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { FOCUS_AREAS, DEFAULT_FOCUS_AREA } from '~/lib/constants/focusAreas';
import { foilApi } from '~/lib/utils/util';

// Define the Category type based on schema.graphql
export interface Category {
  id: string;
  name: string;
  slug: string;
  iconSvg?: string;
  color?: string;
  // Add other fields from CategoryType if needed elsewhere
}

// Define the structure of the data returned by the category query
interface GetCategoriesApiResponse {
  data: {
    categories: Category[];
  };
  // Add other potential API response fields if necessary
}

// GraphQL query to fetch categories
const GET_CATEGORIES = gql`
  query GetCategories {
    categories {
      id
      name
      slug
    }
  }
`;

// Custom hook to fetch categories using Tanstack Query
export const useCategories = () => {
  return useQuery<Category[], Error>({
    // Specify return type and error type
    queryKey: ['categories'], // Define a query key
    queryFn: async (): Promise<Category[]> => {
      // Define the async function
      try {
        const response: GetCategoriesApiResponse = await foilApi.post(
          '/graphql',
          {
            query: print(GET_CATEGORIES),
          }
        );
        // Ensure the response structure is as expected
        if (
          response &&
          response.data &&
          Array.isArray(response.data.categories)
        ) {
          return response.data.categories;
        }
        console.error(
          'Unexpected API response structure for categories:',
          response
        );
        throw new Error(
          'Failed to fetch categories: Invalid response structure'
        );
      } catch (err) {
        console.error('Error fetching categories:', err);
        // Re-throw the error or return a default value like an empty array
        // Re-throwing ensures error state is propagated by react-query
        throw err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching categories');
      }
    },
    // Add other react-query options if needed (e.g., staleTime, refetchOnWindowFocus)
  });
};

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
  vaultAddress: string;
  isYin: boolean;
  collateralAsset: string;
  epochs: Epoch[];
}

// Define the new EnrichedMarket type
export interface EnrichedMarket extends Market {
  category: Category;
}

export interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

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

const MARKETS_QUERY = gql`
  query GetMarkets {
    markets {
      id
      address
      chainId
      isYin
      vaultAddress
      collateralAsset
      category {
        id
        name
        slug
      }
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
`;

const MARKET_CANDLES_QUERY = gql`
  query GetMarketCandles(
    $address: String!
    $chainId: Int!
    $epochId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
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
  query GetTotalVolume(
    $marketAddress: String!
    $chainId: Int!
    $epochId: Int!
  ) {
    totalVolumeByEpoch(
      marketAddress: $marketAddress
      chainId: $chainId
      epochId: $epochId
    )
  }
`;

// Define an interface for the market data structure returned by MARKETS_QUERY
interface MarketApiResponse {
  id: number;
  address: string;
  chainId: number;
  isYin: boolean;
  vaultAddress: string;
  collateralAsset: string;
  category: Category | null; // Allow null based on schema possibility
  epochs: Epoch[];
}

// Rename the hook to reflect its output
export const useEnrichedMarkets = () => {
  // Update the return type to use EnrichedMarket[]
  return useQuery<EnrichedMarket[]>({
    queryKey: ['enrichedMarkets'], // Changed queryKey
    queryFn: async () => {
      // Create a lookup map for focus areas using their ID (which matches category slug)
      const focusAreaMap = new Map<
        string,
        { iconSvg: string; color: string; name: string }
      >();
      FOCUS_AREAS.forEach((area) => {
        focusAreaMap.set(area.id, {
          iconSvg: area.iconSvg,
          color: area.color,
          name: area.name,
        });
      });

      const { data } = await foilApi.post('/graphql', {
        query: print(MARKETS_QUERY), // Use the new MARKETS_QUERY
      });

      // Check if data and data.markets exist
      if (!data || !data.markets) {
        console.error(
          '[useEnrichedMarkets] No markets data received from API or data structure invalid.'
        );
        return []; // Return empty array or handle error as appropriate
      }

      // Process the flat list of markets directly
      const mappedMarkets = data.markets.map((market: MarketApiResponse) => {
        // Apply the type here

        let categoryInfo: Category; // Use the updated Category type

        // Ensure category exists and enrich it with focus area data
        if (market.category) {
          const focusAreaData = focusAreaMap.get(market.category.slug); // Match category slug with focus area id
          categoryInfo = {
            id: market.category.id,
            // Use focus area name if available, otherwise use the category name from the database
            name: focusAreaData?.name || market.category.name,
            slug: market.category.slug,
            // Use focus area data if found, otherwise fallback to default
            iconSvg: focusAreaData?.iconSvg || DEFAULT_FOCUS_AREA.iconSvg,
            color: focusAreaData?.color || DEFAULT_FOCUS_AREA.color,
          };
        } else {
          // Provide default category including default focus area data
          categoryInfo = {
            id: 'unknown',
            name: 'Unknown',
            slug: 'unknown',
            iconSvg: DEFAULT_FOCUS_AREA.iconSvg,
            color: DEFAULT_FOCUS_AREA.color,
          };
        }

        return {
          ...market, // Spread original market fields (id, address, chainId, etc.)
          category: categoryInfo, // Use fetched or default category
        };
      });

      // Rename mappedMarkets to enrichedMarkets as the filtering step is removed
      const enrichedMarkets: EnrichedMarket[] = mappedMarkets;

      return enrichedMarkets;
    },
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
          return !latest || current.timestamp > latest.timestamp
            ? current
            : latest;
        }, null);

        if (!latestCandle) {
          return { timestamp: null, value: null };
        }

        return {
          timestamp: latestCandle.timestamp.toString(),
          value: latestCandle.close,
        };
      } catch (error) {
        console.error('Error fetching latest index price:', error);
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

  // Add debugging info
  console.log('useMarketCandles called with:', market);

  return useQuery<Candle[] | null>({
    queryKey: [
      'marketCandles',
      `${market.chainId}:${market.address}`,
      market.epochId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.epochId === 0) {
        console.log('useMarketCandles early return - invalid params:', market);
        return null;
      }

      try {
        console.log('Fetching market candles for:', {
          address: market.address,
          chainId: market.chainId,
          epochId: market.epochId,
          from,
          to,
          interval,
        });

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

        console.log('Market candles response:', {
          candlesCount: data.marketCandles?.length || 0,
          sample: data.marketCandles?.slice(0, 2) || [],
        });

        return data.marketCandles || [];
      } catch (error) {
        console.error('Error fetching market candles:', error);
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
        console.error('Error fetching total volume:', error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.epochId !== 0,
    refetchInterval: 60000,
  });
};

export const getLatestPriceFromCandles = (
  candles: Candle[] | null | undefined
): number | null => {
  if (!candles || candles.length === 0) {
    return null;
  }
  const latestCandle = candles.reduce((latest, current) => {
    return !latest || current.timestamp > latest.timestamp ? current : latest;
  });
  const price = parseFloat(latestCandle.close);
  return isNaN(price) ? null : price;
};
