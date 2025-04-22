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
    const promises = [
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
    ];

    const [marketResponse, indexResponse] = await Promise.all(promises);

    let marketCandles: CandleType[] = [];
    let indexCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] = [];
    let fetchError: Error | null = null;

    // Process Market Candle Response
    if (marketResponse) {
      const marketData = marketResponse.data as
        | MarketCandlesResponse
        | { errors?: any[] };
      if (marketData && 'errors' in marketData && marketData.errors) {
        console.error(
          'GraphQL error fetching market candles:',
          marketData.errors
        );
        fetchError = new Error(
          marketData.errors[0]?.message || 'Error fetching market candles'
        );
      } else if (marketData && 'marketCandles' in marketData) {
        marketCandles = marketData.marketCandles ?? [];
      } else {
        console.warn(
          'Unexpected market candle response structure:',
          marketData
        );
      }
    }

    // Process Index Candle Response
    if (!fetchError && indexResponse) {
      const indexData = indexResponse.data as
        | IndexCandlesResponse
        | { errors?: any[] };
      if (indexData && 'errors' in indexData && indexData.errors) {
        console.error(
          'GraphQL error fetching index candles:',
          indexData.errors
        );
        fetchError = new Error(
          indexData.errors[0]?.message || 'Error fetching index candles'
        );
      } else if (indexData && 'indexCandles' in indexData) {
        indexCandlesRaw = indexData.indexCandles ?? [];
      } else {
        console.warn('Unexpected index candle response structure:', indexData);
      }
    }

    if (fetchError) {
      throw fetchError; // Propagate the first error encountered
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

    // 2. Create map for index prices
    const indexPriceMap = new Map<number, number | null>();
    indexCandlesRaw.forEach((candle) => {
      const closeNum = safeParseFloat(candle.close);
      if (closeNum !== null) {
        indexPriceMap.set(candle.timestamp, closeNum * indexMultiplier);
      }
    });

    // 3. Combine data
    const timestamps = new Set<number>(); // Keep track of all unique timestamps
    marketCandles.forEach((c) => timestamps.add(c.timestamp));
    indexCandlesRaw.forEach((c) => timestamps.add(c.timestamp));

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);

    // Create map for market candles
    const marketCandleMap = new Map<number, CandleType>();
    marketCandles.forEach((c) => marketCandleMap.set(c.timestamp, c));

    // Build the final combined data array
    const combinedData: PriceChartDataPoint[] = sortedTimestamps.map((ts) => {
      const dataPoint: PriceChartDataPoint = { timestamp: ts };
      const marketCandle = marketCandleMap.get(ts);

      // Add market candle data
      if (marketCandle) {
        dataPoint.open = safeParseFloat(marketCandle.open) ?? undefined;
        dataPoint.high = safeParseFloat(marketCandle.high) ?? undefined;
        dataPoint.low = safeParseFloat(marketCandle.low) ?? undefined;
        dataPoint.close = safeParseFloat(marketCandle.close) ?? undefined;
      }

      // Add index price data
      const indexPrice = indexPriceMap.get(ts);
      if (indexPrice !== undefined && indexPrice !== null) {
        dataPoint.indexPrice = indexPrice;
      }

      return dataPoint;
    });

    return combinedData;
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
