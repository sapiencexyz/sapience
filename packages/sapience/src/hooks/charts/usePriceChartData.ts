import { gql } from '@apollo/client'; // Keep for gql tag
import type { CandleType } from '@foil/ui/types/graphql';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { formatEther } from 'viem';

import { useSapience } from '../../lib/context/SapienceProvider'; // Corrected path
import { foilApi } from '../../lib/utils/util'; // Adjust path as needed

// GraphQL Queries
const GET_MARKET_CANDLES = gql`
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

const GET_INDEX_CANDLES = gql`
  query IndexCandles(
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
        close # Only need close for the index line
      }
      lastUpdateTimestamp
    }
  }
`;

// Add Resource Candles Query
const GET_RESOURCE_CANDLES = gql`
  query ResourceCandles(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    resourceCandles(slug: $slug, from: $from, to: $to, interval: $interval) {
      data {
        timestamp
        close # Assuming we only need close for the line
      }
      lastUpdateTimestamp
    }
  }
`;

// TODO: Make this dynamic?
const TRAILING_AVG_TIME_SECONDS = 604800; // 7 day trailing average
const GET_RESOURCE_TRAILING_AVG_CANDLES = gql`
  query ResourceTrailingAverageCandles(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
    $trailingAvgTime: Int!
  ) {
    resourceTrailingAverageCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
      trailingAvgTime: $trailingAvgTime
    ) {
      data {
        timestamp
        close # Assuming we only need close for the line
      }
      lastUpdateTimestamp
    }
  }
`;

// Type for individual data points in the returned chartData array
export interface PriceChartDataPoint {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  indexPrice?: number; // Scaled index price
  resourcePrice?: number; // Add resource price (scaled if needed)
  trailingAvgPrice?: number; // Add trailing average price (scaled if needed)
}

// Hook Props Interface
interface UsePriceChartDataProps {
  marketAddress: string;
  chainId: number;
  marketId: string;
  resourceSlug?: string; // Add optional resource slug
  interval: number; // Time interval in seconds
  quoteTokenName?: string; // Needed for correct index price scaling
  fromTimestamp?: number; // Optional start time (Unix seconds)
  toTimestamp?: number; // Optional end time (Unix seconds)
}

// Hook Return Interface
interface UsePriceChartDataReturn {
  chartData: PriceChartDataPoint[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

// Helper to safely parse string numbers, returning null if invalid
// const safeParseFloat = (value: string | null | undefined): number | null => {
//   if (value === null || value === undefined || value === '') return null;
//   const num = parseFloat(value);
//   return Number.isNaN(num) ? null : num;
// };

// Helper function to merge price data into the map
const mergePriceData = (
  map: Map<number, PriceChartDataPoint>,
  candles: Pick<CandleType, 'timestamp' | 'close'>[], // Use imported CandleType
  priceFieldName: keyof PriceChartDataPoint
) => {
  candles.forEach((candle) => {
    const closeNum = Number(candle.close);
    if (!Number.isNaN(closeNum)) {
      map.set(candle.timestamp, {
        timestamp: candle.timestamp, // Ensure timestamp is always present
        ...map.get(candle.timestamp), // Spread existing data first
        [priceFieldName]: closeNum, // Add/overwrite the specific price
      });
    }
  });
};

// Helper function to parse GraphQL candle responses
const parseCandleResponse = <
  TResponse extends object, // Generic response type
  TKey extends keyof TResponse, // Key within the response (e.g., 'marketCandles')
>(
  response: unknown, // Raw response from API call - Use unknown instead of any
  dataKey: TKey,
  entityName: string
): TResponse[TKey] | null => {
  // Ensure response is an object before proceeding with checks
  if (!response || typeof response !== 'object') {
    console.warn(`Invalid response type for ${entityName} candles.`);
    return null;
  }

  // Check if 'data' property exists
  if (!('data' in response)) {
    console.warn(
      `Missing 'data' property in response for ${entityName} candles.`
    );
    return null;
  }

  const data = response.data as TResponse | { errors?: { message: string }[] }; // Type errors more specifically

  // Type guard for error checking
  if (data && typeof data === 'object' && 'errors' in data && data.errors) {
    console.error(`GraphQL error fetching ${entityName} candles:`, data.errors);
    // Use the more specific error type
    throw new Error(
      data.errors[0]?.message || `Error fetching ${entityName} candles`
    );
  }

  // Type guard for data key check and return type
  if (data && typeof data === 'object' && dataKey in data) {
    // Ensure the return type matches the expected structure (e.g., CandleType[] | null)
    return (data as TResponse)[dataKey] ?? null;
  }
  console.warn(`Unexpected ${entityName} candle response structure:`, data);
  return null;
};

// Define expected shapes for parseCandleResponses arguments, referencing Query type keys
type MarketCandlesQueryResponse = {
  marketCandles: {
    data: CandleType[] | null;
    lastUpdateTimestamp: number;
  } | null;
};
type IndexCandlesQueryResponse = {
  indexCandles: {
    data: Pick<CandleType, 'timestamp' | 'close'>[] | null;
    lastUpdateTimestamp: number;
  } | null;
};
type ResourceCandlesQueryResponse = {
  resourceCandles: {
    data: Pick<CandleType, 'timestamp' | 'close'>[] | null;
    lastUpdateTimestamp: number;
  } | null;
};
type TrailingAvgCandlesQueryResponse = {
  resourceTrailingAverageCandles: {
    data: Pick<CandleType, 'timestamp' | 'close'>[] | null;
    lastUpdateTimestamp: number;
  } | null;
};

// Helper function to parse multiple candle responses
const parseCandleResponses = (
  marketResponse: unknown,
  indexResponse: unknown,
  resourceResponse: unknown,
  trailingAvgResponse: unknown,
  resourceSlug: string | undefined
) => {
  let marketCandles: CandleType[]; // Use imported CandleType
  let indexCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[]; // Use Pick with imported CandleType

  // Parse required responses, re-throwing errors for useQuery
  try {
    // Use the specific response types for better type checking
    marketCandles =
      parseCandleResponse<MarketCandlesQueryResponse, 'marketCandles'>(
        marketResponse,
        'marketCandles',
        'market'
      )?.data ?? [];
    indexCandlesRaw =
      parseCandleResponse<IndexCandlesQueryResponse, 'indexCandles'>(
        indexResponse,
        'indexCandles',
        'index'
      )?.data ?? [];
  } catch (error) {
    console.error('Error parsing required candle data:', error);
    throw error;
  }

  // Parse optional responses
  const resourceCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] =
    resourceSlug && resourceResponse
      ? (parseCandleResponse<ResourceCandlesQueryResponse, 'resourceCandles'>(
          resourceResponse,
          'resourceCandles',
          'resource'
        )?.data ?? [])
      : [];

  const trailingAvgCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] =
    resourceSlug && trailingAvgResponse
      ? (parseCandleResponse<
          TrailingAvgCandlesQueryResponse,
          'resourceTrailingAverageCandles'
        >(
          trailingAvgResponse,
          'resourceTrailingAverageCandles',
          'trailing average'
        )?.data ?? [])
      : [];

  return {
    marketCandles,
    indexCandlesRaw,
    resourceCandlesRaw,
    trailingAvgCandlesRaw,
  };
};

export const usePriceChartData = ({
  marketAddress,
  chainId,
  marketId,
  resourceSlug, // Destructure resourceSlug
  interval,
  quoteTokenName,
  fromTimestamp: propFromTimestamp,
  toTimestamp: propToTimestamp,
}: UsePriceChartDataProps): UsePriceChartDataReturn => {
  const { stEthPerToken } = useSapience(); // Still needed for index scaling

  const fetchData = async (): Promise<PriceChartDataPoint[]> => {
    // Determine time range
    const now = Math.floor(Date.now() / 1000);
    const defaultLookbackSeconds = 30 * 24 * 60 * 60; // 30 days default
    const from = propFromTimestamp ?? now - defaultLookbackSeconds;
    const to = propToTimestamp ?? now;

    // Base queries
    const marketQuery = foilApi.post('/graphql', {
      query: print(GET_MARKET_CANDLES),
      variables: {
        address: marketAddress,
        chainId,
        marketId,
        from,
        to,
        interval,
      },
    });
    const indexQuery = foilApi.post('/graphql', {
      query: print(GET_INDEX_CANDLES),
      variables: {
        address: marketAddress,
        chainId,
        marketId,
        from,
        to,
        interval,
      },
    });

    // Conditional queries for resource data
    const resourceQuery = resourceSlug
      ? foilApi.post('/graphql', {
          query: print(GET_RESOURCE_CANDLES),
          variables: { slug: resourceSlug, from, to, interval },
        })
      : Promise.resolve(null); // Resolve null if no slug

    const trailingAvgQuery = resourceSlug
      ? foilApi.post('/graphql', {
          query: print(GET_RESOURCE_TRAILING_AVG_CANDLES),
          variables: {
            slug: resourceSlug,
            from,
            to,
            interval,
            trailingAvgTime: TRAILING_AVG_TIME_SECONDS,
          },
        })
      : Promise.resolve(null); // Resolve null if no slug

    // Fetch all data concurrently
    const [
      marketResponse,
      indexResponse,
      resourceResponse,
      trailingAvgResponse,
    ] = await Promise.all([
      marketQuery,
      indexQuery,
      resourceQuery,
      trailingAvgQuery,
    ]);

    // Parse responses using the new helper function
    const {
      marketCandles,
      indexCandlesRaw,
      resourceCandlesRaw,
      trailingAvgCandlesRaw,
    } = parseCandleResponses(
      marketResponse,
      indexResponse,
      resourceResponse,
      trailingAvgResponse,
      resourceSlug
    );

    // --- Data Processing ---

    // 1. Determine Index Multiplier (assuming resource/avg prices don't need scaling for now)
    // TODO: Confirm if resource/trailing avg prices need scaling
    let indexMultiplier: bigint;
    const scalingConstant = 1e18;
    if (quoteTokenName?.toLowerCase() === 'wsteth') {
      indexMultiplier =
        stEthPerToken && stEthPerToken > 0
          ? (BigInt(1e18) * BigInt(scalingConstant)) /
            BigInt(Math.floor(stEthPerToken * scalingConstant))
          : BigInt(1e18);
    } else {
      indexMultiplier = BigInt(1e9); // Scale gwei to wei (Assuming default)
    }

    // 2. Combine data using a Map
    const combinedDataMap = new Map<number, PriceChartDataPoint>();

    const marketCandlesFiltered = [];
    let flag = true;
    for (let i = 0; i < marketCandles.length; i++) {
      if (!(flag && marketCandles[i].close === '0')) {
        marketCandlesFiltered.push(marketCandles[i]);
        flag = false;
      }
    }

    const marketCandlesFormatter = (price: bigint) => {
      try {
        // Lightweight Charts provides price as number, viem expects bigint.
        // Rounding might be needed if intermediate calcs create decimals,
        // though raw wei should be integers. Use Math.round for safety.
        const formattedPrice = formatEther(price);
        // formatEther returns string, convert back to number for toFixedF
        return Number(formattedPrice);
      } catch (e) {
        console.error('Error formatting price with formatEther:', e);
        // Fallback or default display in case of error
        throw e;
      }
    };

    // Process market candles
    marketCandlesFiltered.forEach((candle) => {
      const dataPoint: PriceChartDataPoint = {
        timestamp: candle.timestamp,
        open: marketCandlesFormatter(BigInt(candle.open) ?? undefined),
        high: marketCandlesFormatter(BigInt(candle.high) ?? undefined),
        low: marketCandlesFormatter(BigInt(candle.low) ?? undefined),
        close: marketCandlesFormatter(BigInt(candle.close) ?? undefined),
      };

      combinedDataMap.set(candle.timestamp, dataPoint);
    });

    const indexCandlesProcessed = indexCandlesRaw.map((candle) => {
      const formattedPrice = marketCandlesFormatter(
        BigInt(candle.close) * indexMultiplier
      );
      return {
        timestamp: candle.timestamp,
        close: formattedPrice.toFixed(4),
      };
    });

    const resourceCandlesProcessed = resourceCandlesRaw.map((candle) => {
      const formattedPrice = marketCandlesFormatter(
        BigInt(candle.close) * BigInt(1e9)
      );
      return {
        timestamp: candle.timestamp,
        close: formattedPrice.toFixed(4),
      };
    });

    const trailingAvgCandlesProcessed = trailingAvgCandlesRaw.map((candle) => {
      const formattedPrice = marketCandlesFormatter(
        BigInt(candle.close) * BigInt(1e9)
      );
      return {
        timestamp: candle.timestamp,
        close: formattedPrice.toFixed(4),
      };
    });

    mergePriceData(combinedDataMap, indexCandlesProcessed, 'indexPrice');

    // Process and merge resource candles
    mergePriceData(combinedDataMap, resourceCandlesProcessed, 'resourcePrice'); // Assuming 1e9 multiplier

    // Process and merge trailing average candles
    mergePriceData(
      combinedDataMap,
      trailingAvgCandlesProcessed,
      'trailingAvgPrice'
    ); // Assuming 1e9 multiplier

    // 3. Convert map values to array and sort
    return Array.from(combinedDataMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  };

  const { data, isLoading, isError, error, isFetching } = useQuery<
    PriceChartDataPoint[],
    Error
  >({
    // Update query key
    queryKey: [
      'priceChart',
      marketAddress,
      chainId,
      marketId,
      resourceSlug, // Add resourceSlug
      interval,
      quoteTokenName,
      propFromTimestamp,
      propToTimestamp,
    ],
    queryFn: fetchData,
    // Enable query only if essential base params are present
    enabled: !!marketAddress && !!chainId && !!marketId && interval > 0,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // 1 minute
  });
  return { chartData: data ?? [], isLoading, isFetching, isError, error };
};
