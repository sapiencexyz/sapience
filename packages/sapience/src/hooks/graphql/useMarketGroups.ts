import { graphqlRequest } from '@sapience/ui/lib';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import type {
  Market as MarketType,
  MarketGroup as MarketGroupType,
  Category as CategoryType,
  Position as PositionType,
} from '@sapience/ui/types/graphql';

import {
  DEFAULT_FOCUS_AREA,
  getFocusAreaMap,
} from '~/lib/constants/focusAreas';
import type { MarketGroupClassification } from '~/lib/types';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

// GraphQL query to fetch categories
const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
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
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryType[]> => {
      try {
        type CategoriesQueryResult = {
          categories: CategoryType[];
        };

        const data =
          await graphqlRequest<CategoriesQueryResult>(GET_CATEGORIES);

        if (!data || !Array.isArray(data.categories)) {
          console.error(
            'Unexpected API response structure for categories:',
            data
          );
          throw new Error(
            'Failed to fetch categories: Invalid response structure'
          );
        }

        return data.categories;
      } catch (err) {
        console.error('Error fetching categories:', err);
        throw err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching categories');
      }
    },
  });
};

export interface EnrichedMarketGroup
  extends Omit<MarketGroupType, 'category' | 'markets'> {
  category: CategoryType & { iconSvg?: string; color?: string };
  markets: MarketType[];
  latestMarketId?: bigint;
  marketClassification: MarketGroupClassification;
}

export interface Candle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

const LATEST_INDEX_PRICE_QUERY = /* GraphQL */ `
  query LatestIndexPrice(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
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

const MARKETS_QUERY = /* GraphQL */ `
  query Markets {
    marketGroups {
      id
      address
      chainId
      owner
      collateralAsset
      question
      rules
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
      isBridged
      resource {
        id
        name
        slug
      }
      marketParamsFeerate
      marketParamsAssertionliveness
      marketParamsBondcurrency
      marketParamsBondamount
      marketParamsUniswappositionmanager
      marketParamsUniswapswaprouter
      marketParamsUniswapquoter
      marketParamsOptimisticoraclev3
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
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
        startingSqrtPriceX96
        marketParamsFeerate
        marketParamsAssertionliveness
        marketParamsBondcurrency
        marketParamsBondamount
        claimStatementYesOrNumeric
        claimStatementNo
        marketParamsUniswappositionmanager
        marketParamsUniswapswaprouter
        marketParamsUniswapquoter
        marketParamsOptimisticoraclev3
      }
    }
  }
`;

const MARKET_CANDLES_QUERY = /* GraphQL */ `
  query MarketCandles(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    marketCandles(
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

const TOTAL_VOLUME_QUERY = /* GraphQL */ `
  query TotalVolume($marketAddress: String!, $chainId: Int!, $marketId: Int!) {
    totalVolumeByMarket(
      marketAddress: $marketAddress
      chainId: $chainId
      marketId: $marketId
    )
  }
`;

const OPEN_INTEREST_QUERY = /* GraphQL */ `
  query OpenInterest($marketAddress: String!, $chainId: Int!, $marketId: Int!) {
    positions(
      where: {
        market: {
          is: {
            marketGroup: {
              is: {
                address: { equals: $marketAddress }
                chainId: { equals: $chainId }
              }
            }
            marketId: { equals: $marketId }
          }
        }
      }
    ) {
      id
      positionId
      collateral
      isSettled
      market {
        id
        marketId
        marketGroup {
          id
          collateralDecimals
        }
      }
    }
  }
`;

export const getEnrichedMarketGroups = async () => {
  // Create a lookup map for focus areas using their ID (which matches category slug)
  const focusAreaMap = getFocusAreaMap();

  // --- Fetch initial market group data ---
  type MarketGroupsQueryResult = {
    marketGroups: MarketGroupType[];
  };

  const data = await graphqlRequest<MarketGroupsQueryResult>(MARKETS_QUERY);

  if (!data || !data.marketGroups) {
    console.error(
      '[useEnrichedMarketGroups] No market groups data received from API or data structure invalid.'
    );
    return [];
  }

  // --- Process market groups (enrichment only) ---
  return data.marketGroups.map(
    (marketGroup: MarketGroupType): EnrichedMarketGroup => {
      const focusAreaData = focusAreaMap.get(marketGroup?.category?.slug || '');

      let categoryInfo: CategoryType & { iconSvg?: string; color?: string };
      if (marketGroup.category && focusAreaData) {
        categoryInfo = {
          ...marketGroup.category,
          marketGroups: marketGroup.category.marketGroups,
          iconSvg: focusAreaData?.iconSvg || DEFAULT_FOCUS_AREA.iconSvg,
          color: focusAreaData?.color || '#9CA3AF', // Tailwind gray-400
        };
      } else {
        categoryInfo = {
          id: -1,
          name: 'Unknown',
          slug: 'unknown',
          createdAt: new Date().toISOString(),
          resources: [],
          marketGroups: [],
          iconSvg: DEFAULT_FOCUS_AREA.iconSvg,
          color: '#9CA3AF', // Tailwind gray-400
        };
      }

      const mappedMarkets = (marketGroup.markets || []).map(
        (market: MarketType): MarketType => ({
          ...market,
          id: market.id,
          positions: market.positions || [],
        })
      );

      // Get classification
      const classification = getMarketGroupClassification(marketGroup);

      // Return the enriched group WITHOUT fetching marketId here
      return {
        ...marketGroup,
        category: categoryInfo,
        markets: mappedMarkets,
        marketClassification: classification,
      };
    }
  );
};

export const useEnrichedMarketGroups = () => {
  return useQuery<EnrichedMarketGroup[]>({
    queryKey: ['enrichedMarketGroups'],
    queryFn: getEnrichedMarketGroups,
  });
};

export const prefetchEnrichedMarketGroups = async (
  queryClient: QueryClient
) => {
  return await queryClient.prefetchQuery({
    queryKey: ['enrichedMarketGroups'],
    queryFn: getEnrichedMarketGroups,
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
        type IndexPriceQueryResult = {
          indexCandles: {
            data: Candle[];
            lastUpdateTimestamp: number;
          };
        };

        const data = await graphqlRequest<IndexPriceQueryResult>(
          LATEST_INDEX_PRICE_QUERY,
          {
            address: market.address,
            chainId: market.chainId,
            marketId: market.marketId.toString(),
            from: Math.floor(Date.now() / 1000) - 300,
            to: Math.floor(Date.now() / 1000),
            interval: 60,
          }
        );

        const indexCandlesData = data.indexCandles;
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
    refetchInterval: 15000,
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
        type MarketCandlesQueryResult = {
          marketCandles: {
            data: Candle[];
            lastUpdateTimestamp: number;
          };
        };

        const data = await graphqlRequest<MarketCandlesQueryResult>(
          MARKET_CANDLES_QUERY,
          {
            address: market.address,
            chainId: market.chainId,
            marketId: market.marketId.toString(),
            from,
            to,
            interval,
          }
        );

        return data.marketCandles.data || [];
      } catch (error) {
        console.error('Error fetching market candles:', error);
        return null;
      }
    },
    enabled: !!market.address && !!market.chainId && market.marketId !== 0,
    refetchInterval: 15000,
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
        type TotalVolumeQueryResult = {
          totalVolumeByMarket: number;
        };

        const data = await graphqlRequest<TotalVolumeQueryResult>(
          TOTAL_VOLUME_QUERY,
          {
            marketAddress: market.address,
            chainId: market.chainId,
            marketId: market.marketId,
          }
        );

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

export const useOpenInterest = (market: {
  address: string;
  chainId: number;
  marketId: number;
}) => {
  return useQuery<number | null>({
    queryKey: [
      'openInterest',
      `${market.chainId}:${market.address}`,
      market.marketId,
    ],
    queryFn: async () => {
      if (!market.address || !market.chainId || market.marketId === 0) {
        return null;
      }

      try {
        type OpenInterestQueryResult = {
          positions: PositionType[];
        };

        const data = await graphqlRequest<OpenInterestQueryResult>(
          OPEN_INTEREST_QUERY,
          {
            marketAddress: market.address,
            chainId: market.chainId,
            marketId: market.marketId,
          }
        );

        if (!data || !data.positions) {
          console.log('No positions data received');
          return 0;
        }

        // Filter positions for this specific market and sum collateral for unsettled positions
        const marketPositions = data.positions;

        const unsettledPositions = marketPositions.filter(
          (position: PositionType) =>
            position.isSettled === false || position.isSettled === null
        );

        // Get collateral decimals from the first position (they should all be the same market group)
        const collateralDecimals =
          marketPositions.length > 0
            ? marketPositions[0].market?.marketGroup?.collateralDecimals || 18
            : 18;

        return unsettledPositions.reduce(
          (total: number, position: PositionType) => {
            try {
              // Convert from smallest unit to human readable using formatUnits
              if (!position.collateral) {
                return total;
              }
              const collateralBigInt = BigInt(position.collateral);
              const collateralValue = Number(
                formatUnits(collateralBigInt, collateralDecimals)
              );
              return total + collateralValue;
            } catch (error) {
              console.warn(
                'Error parsing collateral value:',
                position.collateral,
                error
              );
              return total;
            }
          },
          0
        );
      } catch (error) {
        console.error('Error fetching open interest:', error);
        return null;
      }
    },
    enabled: Boolean(market.address) && Boolean(market.chainId),
    staleTime: 30000,
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
