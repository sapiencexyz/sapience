import { gql } from '@apollo/client'; // Keep for gql tag
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';

import type { CandleType } from '../../lib/interfaces/interfaces'; // Adjust path as needed
import { foilApi } from '../../lib/utils/util'; // Adjust path as needed
import { useSapience } from '~/lib/context/SapienceProvider'; // Adjust path as needed

// GraphQL Queries (Keep GET_MARKET_CANDLES and GET_INDEX_CANDLES)
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
      timestamp
      open
      high
      low
      close
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
      timestamp
      close # Only need close for the index line
    }
  }
`;

// Interfaces for API responses
interface MarketCandlesResponse {
  marketCandles: CandleType[] | null;
}

interface IndexCandlesResponse {
  indexCandles: Pick<CandleType, 'timestamp' | 'close'>[] | null;
}

// Type for individual data points in the returned chartData array
// Simplify to only include necessary fields for price chart
export interface PriceChartDataPoint {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  indexPrice?: number; // Scaled index price
}

// Hook Props Interface - Simplified
interface UsePriceChartDataProps {
  marketAddress: string;
  chainId: number;
  marketId: string;
  interval: number; // Time interval in seconds
  quoteTokenName?: string; // Needed for correct index price scaling
  fromTimestamp?: number; // Optional start time (Unix seconds)
  toTimestamp?: number; // Optional end time (Unix seconds)
  // Removed: slug, includeMarketData, includeIndexPrice, includeResourceCandles, includeTrailingAveragePrice
  // Assuming market and index are always needed for this specific chart
}

// Hook Return Interface - Simplified to match useQuery return
interface UsePriceChartDataReturn {
  chartData: PriceChartDataPoint[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

// Helper to safely parse string numbers, returning null if invalid
const safeParseFloat = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// Helper function to parse GraphQL candle responses
const parseCandleResponse = <T extends object, K extends keyof T>(
  response: any, // Consider using a more specific type if possible
  dataKey: K,
  entityName: string // e.g., 'market', 'index'
): T[K] | null => {
  if (!response || typeof response !== 'object' || !response.data) {
    console.warn(`Invalid or missing response data for ${entityName} candles.`);
    return null;
  }
  const data = response.data as T | { errors?: any[] };

  // Type guard for error checking
  if (data && typeof data === 'object' && 'errors' in data && data.errors) {
    console.error(`GraphQL error fetching ${entityName} candles:`, data.errors);
    throw new Error(
      (data.errors[0] as any)?.message || `Error fetching ${entityName} candles`
    );
  }

  // Type guard for data key check
  if (data && typeof data === 'object' && dataKey in data) {
    return (data as T)[dataKey] ?? null; // Return null if data[dataKey] is null/undefined
  }
  console.warn(`Unexpected ${entityName} candle response structure:`, data);
  return null;
};

export const usePriceChartData = ({
  marketAddress,
  chainId,
  marketId,
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

    // Fetch Market and Index Candles concurrently
    const [marketResponse, indexResponse] = await Promise.all([
      foilApi.post('/graphql', {
        query: print(GET_MARKET_CANDLES),
        variables: {
          address: marketAddress,
          chainId,
          marketId,
          from,
          to,
          interval,
        },
      }),
      foilApi.post('/graphql', {
        query: print(GET_INDEX_CANDLES),
        variables: {
          address: marketAddress,
          chainId,
          marketId,
          from,
          to,
          interval,
        },
      }),
    ]);

    // Parse responses using the helper function
    // A single try-catch block handles errors from either fetch or parsing
    let marketCandles: CandleType[] = [];
    let indexCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] = [];

    try {
      marketCandles =
        parseCandleResponse<MarketCandlesResponse, 'marketCandles'>(
          marketResponse,
          'marketCandles',
          'market'
        ) || [];
      indexCandlesRaw =
        parseCandleResponse<IndexCandlesResponse, 'indexCandles'>(
          indexResponse,
          'indexCandles',
          'index'
        ) || [];
    } catch (error) {
      // Re-throw the error to be caught by useQuery
      console.error('Error fetching or parsing candle data:', error);
      throw error;
    }

    // --- Data Processing ---

    // 1. Determine Index Multiplier
    let indexMultiplier: number;
    if (quoteTokenName?.toLowerCase() === 'wsteth') {
      indexMultiplier =
        stEthPerToken && stEthPerToken > 0 ? 1e18 / stEthPerToken : 1e18;
    } else {
      indexMultiplier = 1e9; // Scale gwei to wei (Assuming default)
    }

    // 2. Combine data using a Map for efficient merging
    const combinedDataMap = new Map<number, PriceChartDataPoint>();

    // Process market candles
    marketCandles.forEach((candle) => {
      const dataPoint: PriceChartDataPoint = {
        timestamp: candle.timestamp,
        open: safeParseFloat(candle.open) ?? undefined,
        high: safeParseFloat(candle.high) ?? undefined,
        low: safeParseFloat(candle.low) ?? undefined,
        close: safeParseFloat(candle.close) ?? undefined,
      };
      combinedDataMap.set(candle.timestamp, dataPoint);
    });

    // Process and merge index candles
    indexCandlesRaw.forEach((candle) => {
      const closeNum = safeParseFloat(candle.close);
      if (closeNum !== null) {
        const scaledIndexPrice = closeNum * indexMultiplier;
        const existingDataPoint = combinedDataMap.get(candle.timestamp);
        if (existingDataPoint) {
          existingDataPoint.indexPrice = scaledIndexPrice;
        } else {
          // Create a new point if no market data exists for this timestamp
          combinedDataMap.set(candle.timestamp, {
            timestamp: candle.timestamp,
            indexPrice: scaledIndexPrice,
          });
        }
      }
    });

    // 3. Convert map values to an array and sort by timestamp
    return Array.from(combinedDataMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  };

  const { data, isLoading, isError, error } = useQuery<
    PriceChartDataPoint[],
    Error
  >({
    // Include relevant props in the query key for automatic refetching
    queryKey: [
      'priceChart',
      marketAddress,
      chainId,
      marketId,
      interval,
      quoteTokenName,
      propFromTimestamp,
      propToTimestamp,
    ],
    queryFn: fetchData,
    enabled: !!marketAddress && !!chainId && !!marketId && interval > 0, // Only run query if essential params are present
    staleTime: 60 * 1000, // Consider data stale after 1 minute
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  return { chartData: data ?? [], isLoading, isError, error };
};
