import { gql } from '@apollo/client';
import type { MarketType, MarketGroupType, CategoryType } from '@foil/ui/types';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import { FOCUS_AREAS, DEFAULT_FOCUS_AREA } from '~/lib/constants/focusAreas';
import type { MarketGroupClassification } from '~/lib/types';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { foilApi } from '~/lib/utils/util';

// Define the structure of the data returned by the category query
interface GetCategoriesApiResponse {
  data: {
    categories: CategoryType[];
  };
}

// GraphQL query to fetch categories
const GET_CATEGORIES = gql`
  query GetCategories {
    categories {
      id
      name
      slug
      marketGroups {
        id
      }
    }
  }
`;

// Custom hook to fetch categories using Tanstack Query
export const useCategories = () => {
  return useQuery<CategoryType[], Error>({
    // Specify return type and error type
    queryKey: ['categories'], // Define a query key
    queryFn: async (): Promise<CategoryType[]> => {
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

export interface EnrichedMarketGroup
  extends Omit<MarketGroupType, 'category' | 'markets'> {
  category: CategoryType & { iconSvg?: string; color?: string };
  markets: MarketType[];
  latestEpochId?: bigint;
  marketClassification: MarketGroupClassification;
}

export interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

const LATEST_INDEX_PRICE_QUERY = gql`
  query GetLatestIndexPrice($address: String!, $chainId: Int!, $marketId: String!) {
    indexCandlesFromCache(
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

const MARKETS_QUERY = gql`
  query GetMarkets {
    marketGroups {
      id
      address
      chainId
      isYin
      vaultAddress
      owner
      collateralAsset
      question
      baseTokenName
      quoteTokenName
      factoryAddress
      initializationNonce
      minTradeSize
      collateralDecimals
      collateralSymbol
      deployTimestamp
      deployTxnBlockNumber
      isCumulative
      resource {
        id
        name
        slug
      }
      marketParams {
        feeRate
        assertionLiveness
        bondCurrency
        bondAmount
        claimStatement
        uniswapPositionManager
        uniswapSwapRouter
        uniswapQuoter
        optimisticOracleV3
      }
      category {
        id
        name
        slug
      }
      markets {
        id
        marketId
        startTimestamp
        endTimestamp
        settled
        public
        question
        poolAddress
        settlementPriceD18
        optionName
        currentPrice
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
        startingSqrtPriceX96
        marketParams {
          feeRate
          assertionLiveness
          bondCurrency
          bondAmount
          claimStatement
          uniswapPositionManager
          uniswapSwapRouter
          uniswapQuoter
          optimisticOracleV3
        }
      }
    }
  }
`;

const MARKET_CANDLES_QUERY = gql`
  query GetMarketCandlesFromCache(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    marketCandlesFromCache(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        open
        high
        low
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const TOTAL_VOLUME_QUERY = gql`
  query GetTotalVolume(
    $marketAddress: String!
    $chainId: Int!
    $marketId: Int!
  ) {
    totalVolumeByMarket(
      marketAddress: $marketAddress
      chainId: $chainId
      marketId: $marketId
    )
  }
`;

// Rename the hook to reflect its output
export const useEnrichedMarketGroups = () => {
  // Update the return type to use EnrichedMarketGroup[]
  return useQuery<EnrichedMarketGroup[]>({
    // Ensure this matches the actual return
    queryKey: ['enrichedMarketGroups'], // Reverted queryKey
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

      // --- Fetch initial market group data ---
      const { data: apiResponseData } = await foilApi.post('/graphql', {
        query: print(MARKETS_QUERY),
      });

      if (!apiResponseData || !apiResponseData.marketGroups) {
        console.error(
          '[useEnrichedMarketGroups] No market groups data received from API or data structure invalid.'
        );
        return [];
      }

      // --- Process market groups (enrichment only) ---
      return apiResponseData.marketGroups.map(
        (marketGroup: MarketGroupType): EnrichedMarketGroup => {
          // marketGroup is now MarketGroupType
          let categoryInfo: CategoryType & { iconSvg?: string; color?: string };

          if (marketGroup.category) {
            const focusAreaData = focusAreaMap.get(marketGroup.category.slug);
            categoryInfo = {
              id: marketGroup.category.id,
              name: focusAreaData?.name || marketGroup.category.name,
              slug: marketGroup.category.slug,
              marketGroups: marketGroup.category.marketGroups,
              iconSvg: focusAreaData?.iconSvg || DEFAULT_FOCUS_AREA.iconSvg,
              color: focusAreaData?.color || DEFAULT_FOCUS_AREA.color,
            };
          } else {
            categoryInfo = {
              id: 'unknown',
              name: 'Unknown',
              slug: 'unknown',
              marketGroups: [],
              iconSvg: DEFAULT_FOCUS_AREA.iconSvg,
              color: DEFAULT_FOCUS_AREA.color,
            };
          }

          const mappedMarkets = marketGroup.markets.map(
            (market): MarketType => ({
              ...market,
              id: market.id.toString(),
              positions: market.positions || [],
            })
          );

          // Get classification
          const classification = getMarketGroupClassification(marketGroup);

          // Return the enriched group WITHOUT fetching epochId here
          return {
            ...marketGroup,
            category: categoryInfo,
            markets: mappedMarkets,
            marketClassification: classification,
          };
        }
      );
    },
    // Consider adding staleTime or gcTime if needed
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
        return { timestamp: null, value: null };
      }

      try {
        const { data: indexPriceApiResponse } = await foilApi.post('/graphql', {
          query: print(LATEST_INDEX_PRICE_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            marketId: market.marketId.toString(),
            from: Math.floor(Date.now() / 1000) - 300,
            to: Math.floor(Date.now() / 1000),
            interval: 60,
          },
        });

        const indexCandlesData = indexPriceApiResponse.indexCandlesFromCache;
        if (
          !indexCandlesData ||
          !indexCandlesData.data ||
          indexCandlesData.data.length === 0
        ) {
          return { timestamp: null, value: null };
        }

        const latestCandle = indexCandlesData.data.reduce(
          (latest: Candle | null, current: Candle) => {
            return !latest || current.timestamp > latest.timestamp
              ? current
              : latest;
          },
          null
        );

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
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
  });
};

export const useMarketCandles = (market: {
  address: string;
  chainId: number;
  marketId: number;
}) => {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 7 * 24 * 60 * 60;
  const to = now;
  const interval = 3600;

  return useQuery<Candle[] | null>({
    queryKey: [
      'marketCandles',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      try {
        const { data } = await foilApi.post('/graphql', {
          query: print(MARKET_CANDLES_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            marketId: market.marketId.toString(),
            from,
            to,
            interval,
          },
        });

        return data.marketCandlesFromCache.data || [];
      } catch (error) {
        console.error('Error fetching market candles:', error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
    refetchInterval: 60000,
  });
};

export const useTotalVolume = (market: {
  address: string;
  chainId: number;
  marketId: number;
}) => {
  return useQuery<number | null>({
    queryKey: [
      'totalVolume',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      try {
        const { data } = await foilApi.post('/graphql', {
          query: print(TOTAL_VOLUME_QUERY),
          variables: {
            marketAddress: market.address,
            chainId: market.chainId,
            marketId: market.marketId,
          },
        });
        return data.totalVolumeByMarket;
      } catch (error) {
        console.error('Error fetching total volume:', error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
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
  return Number.isNaN(price) ? null : price;
};
