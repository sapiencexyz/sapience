import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet, sepolia } from 'viem/chains'; // Add chains you support
import FoilAbi from '../../../../protocol/deployments/Foil.json'; // Corrected relative path for ABI

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
      marketGroups {
        id
      }
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

export interface Market {
  id: number;
  marketId: number;
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
  public: boolean;
  question: string | null;
  poolAddress?: string | null;
  settlementPriceD18?: string | null;
  optionName?: string | null;
  baseAssetMinPriceTick?: number | null;
  baseAssetMaxPriceTick?: number | null;
  startingSqrtPriceX96?: string | null;
  claimStatement?: string | null;
}

// Define MarketParams type based on GraphQL schema
// Ensure field names match the GQL schema
export interface MarketParams {
  feeRate?: number | null;
  assertionLiveness?: string | null; // Keep as string if it can be large number
  bondCurrency?: string | null;
  bondAmount?: string | null; // Keep as string if it can be large number
  claimStatement?: string | null;
  uniswapPositionManager?: string | null;
  uniswapSwapRouter?: string | null;
  uniswapQuoter?: string | null;
  optimisticOracleV3?: string | null;
}

export interface MarketGroup {
  id: number;
  address: string;
  chainId: number;
  vaultAddress: string;
  owner?: `0x${string}`; // Kept as wagmi Address type
  isYin: boolean;
  collateralAsset: string;
  question?: string | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  markets: Market[];
  // Add fields needed for deployment
  factoryAddress?: string | null;
  initializationNonce?: string | null; // Renamed from nonce for clarity? Or keep as nonce if GQL uses that? Assuming GQL uses initializationNonce
  minTradeSize?: string | null; // Keep as string if it can be large number
  marketParams?: MarketParams | null;
}

// Define the new EnrichedMarket type
export interface EnrichedMarketGroup extends MarketGroup {
  category: Category;
  latestEpochId?: bigint; // Add the latest epoch ID field
  // No need to repeat fields already in MarketGroup
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
    indexCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
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
    marketGroups {
      id
      address
      chainId
      isYin
      vaultAddress
      owner # Added owner
      collateralAsset
      question
      baseTokenName
      quoteTokenName
      factoryAddress # Added factoryAddress
      initializationNonce # Added initializationNonce
      minTradeSize # Added minTradeSize
      marketParams { # Added marketParams structure
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
        poolAddress # Valid field from schema
        settlementPriceD18 # Valid field from schema
        optionName # Valid field from schema
        baseAssetMinPriceTick # Valid field from schema
        baseAssetMaxPriceTick # Valid field from schema
        startingSqrtPriceX96 # Added field
        marketParams { # Added nested field
           claimStatement # Added nested field
        } # Added nested field
      }
    }
  }
`;

const MARKET_CANDLES_QUERY = gql`
  query GetMarketCandles(
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
    $marketId: Int!
  ) {
    totalVolumeByMarket(
      marketAddress: $marketAddress
      chainId: $chainId
      marketId: $marketId
    )
  }
`;

// Define an interface for the market data structure returned by MARKETS_QUERY
interface MarketGroupApiResponse {
  id: number;
  address: string;
  chainId: number;
  isYin: boolean;
  vaultAddress: string;
  collateralAsset: string;
  question?: string | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  category: Category | null; // Allow null based on schema possibility
  markets: Market[];
  factoryAddress?: string | null;
  initializationNonce?: string | null;
  owner?: `0x${string}`;
  minTradeSize?: string | null;
  marketParams?: MarketParams | null;
}

// Rename the hook to reflect its output
export const useEnrichedMarketGroups = () => {
  // Update the return type to use EnrichedMarketGroup[]
  return useQuery<EnrichedMarketGroup[]>({ // Ensure this matches the actual return
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
      const { data } = await foilApi.post('/graphql', {
        query: print(MARKETS_QUERY), 
      });

      if (!data || !data.marketGroups) {
        console.error(
          '[useEnrichedMarketGroups] No market groups data received from API or data structure invalid.'
        );
        return []; 
      }
      
      // --- Process market groups (enrichment only) --- 
      const enrichedMarketGroups = data.marketGroups.map(
        (marketGroup: MarketGroupApiResponse): EnrichedMarketGroup => { // Return EnrichedMarketGroup
          let categoryInfo: Category;
          // ... (category enrichment logic - keep as is) ...
          if (marketGroup.category) {
            const focusAreaData = focusAreaMap.get(marketGroup.category.slug); 
            categoryInfo = {
              id: marketGroup.category.id,
              name: focusAreaData?.name || marketGroup.category.name,
              slug: marketGroup.category.slug,
              iconSvg: focusAreaData?.iconSvg || DEFAULT_FOCUS_AREA.iconSvg,
              color: focusAreaData?.color || DEFAULT_FOCUS_AREA.color,
            };
          } else {
            categoryInfo = {
              id: 'unknown',
              name: 'Unknown',
              slug: 'unknown',
              iconSvg: DEFAULT_FOCUS_AREA.iconSvg,
              color: DEFAULT_FOCUS_AREA.color,
            };
          }

          const mappedMarkets = marketGroup.markets.map((market: any) => ({ // Type needs checking
            ...market,
            claimStatement: market.marketParams?.claimStatement,
          }));

          // Return the enriched group WITHOUT fetching epochId here
          return {
            ...marketGroup,
            category: categoryInfo,
            markets: mappedMarkets,
            // latestEpochId is NOT fetched here anymore
          };
        }
      );

      return enrichedMarketGroups;
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
        const { data } = await foilApi.post('/graphql', {
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

        return data.marketCandles || [];
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
  return isNaN(price) ? null : price;
};
