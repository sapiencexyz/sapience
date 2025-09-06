import { graphqlRequest } from '@sapience/ui/lib';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';

import type { CandleType } from '@sapience/ui/types/graphql';
import { useSapience } from '../../lib/context/SapienceProvider'; // Corrected path

// GraphQL Queries
const GET_MARKET_CANDLES = /* GraphQL */ `
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

const GET_INDEX_CANDLES = /* GraphQL */ `
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
const GET_RESOURCE_CANDLES = /* GraphQL */ `
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

const TRAILING_AVG_TIME_SECONDS_7_DAYS = 604800; // 7 day trailing average
const TRAILING_AVG_TIME_SECONDS_28_DAYS = 2419200; // 28 day trailing average

const GET_RESOURCE_TRAILING_AVG_CANDLES = /* GraphQL */ `
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
  startTimestamp?: number; // Market start time
  endTimestamp?: number; // Market end time
}

// Hook Return Interface
interface UsePriceChartDataReturn {
  chartData: PriceChartDataPoint[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

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
  response: TResponse | null, // Typed response from graphqlRequest
  dataKey: TKey,
  entityName: string
): TResponse[TKey] | null => {
  if (!response) {
    console.warn(`No response for ${entityName} candles.`);
    return null;
  }

  const data = response[dataKey];
  if (!data) {
    console.warn(
      `Missing '${String(dataKey)}' property in response for ${entityName} candles.`
    );
    return null;
  }

  return data;
};

// Type definitions for GraphQL responses
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

const parseCandleResponses = (
  marketResponse: MarketCandlesQueryResponse | null,
  indexResponse: IndexCandlesQueryResponse | null,
  resourceResponse: ResourceCandlesQueryResponse | null,
  trailingAvgResponse: TrailingAvgCandlesQueryResponse | null,
  resourceSlug: string | undefined
) => {
  // Parse market candles
  const marketCandlesData = parseCandleResponse(
    marketResponse,
    'marketCandles',
    'market'
  );
  const marketCandles = marketCandlesData?.data || [];

  // Parse index candles
  const indexCandlesData = parseCandleResponse(
    indexResponse,
    'indexCandles',
    'index'
  );
  const indexCandlesRaw = indexCandlesData?.data || [];

  // Parse resource candles (only if resourceSlug is provided)
  let resourceCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] = [];
  if (resourceSlug) {
    const resourceCandlesData = parseCandleResponse(
      resourceResponse,
      'resourceCandles',
      'resource'
    );
    resourceCandlesRaw = resourceCandlesData?.data || [];
  }

  // Parse trailing average candles (only if resourceSlug is provided)
  let trailingAvgCandlesRaw: Pick<CandleType, 'timestamp' | 'close'>[] = [];
  if (resourceSlug) {
    const trailingAvgCandlesData = parseCandleResponse(
      trailingAvgResponse,
      'resourceTrailingAverageCandles',
      'trailing average'
    );
    trailingAvgCandlesRaw = trailingAvgCandlesData?.data || [];
  }

  return {
    marketCandles,
    indexCandlesRaw,
    resourceCandlesRaw,
    trailingAvgCandlesRaw,
  };
};

// Helper function to determine trailing average time
const getTrailingAvgTime = (
  marketStartTimestamp?: number,
  marketEndTimestamp?: number
): number => {
  if (!marketStartTimestamp || !marketEndTimestamp) {
    return TRAILING_AVG_TIME_SECONDS_7_DAYS;
  }

  const marketDuration = marketEndTimestamp - marketStartTimestamp;
  return marketDuration > TRAILING_AVG_TIME_SECONDS_7_DAYS
    ? TRAILING_AVG_TIME_SECONDS_28_DAYS
    : TRAILING_AVG_TIME_SECONDS_7_DAYS;
};

export const usePriceChartData = ({
  marketAddress,
  chainId,
  marketId,
  resourceSlug,
  interval,
  quoteTokenName,
  fromTimestamp: propFromTimestamp,
  toTimestamp: propToTimestamp,
  startTimestamp: marketStartTimestamp,
  endTimestamp: marketEndTimestamp,
}: UsePriceChartDataProps): UsePriceChartDataReturn => {
  const { stEthPerToken } = useSapience(); // Still needed for index scaling

  const fetchData = async (): Promise<PriceChartDataPoint[]> => {
    // Determine time range
    const now = Math.floor(Date.now() / 1000);
    const defaultLookbackSeconds = 30 * 24 * 60 * 60; // 30 days default
    const from = propFromTimestamp ?? now - defaultLookbackSeconds;
    const to = propToTimestamp ?? now;

    // Base queries
    const marketQuery = graphqlRequest<MarketCandlesQueryResponse>(
      GET_MARKET_CANDLES,
      {
        address: marketAddress,
        chainId,
        marketId,
        from,
        to,
        interval,
      }
    );

    const indexQuery = graphqlRequest<IndexCandlesQueryResponse>(
      GET_INDEX_CANDLES,
      {
        address: marketAddress,
        chainId,
        marketId,
        from,
        to,
        interval,
      }
    );

    // Conditional queries for resource data
    const resourceQuery = resourceSlug
      ? graphqlRequest<ResourceCandlesQueryResponse>(GET_RESOURCE_CANDLES, {
          slug: resourceSlug,
          from,
          to,
          interval,
        })
      : Promise.resolve(null); // Resolve null if no slug

    // Get trailing average time
    const trailingAvgTime = getTrailingAvgTime(
      marketStartTimestamp,
      marketEndTimestamp
    );

    const trailingAvgQuery = resourceSlug
      ? graphqlRequest<TrailingAvgCandlesQueryResponse>(
          GET_RESOURCE_TRAILING_AVG_CANDLES,
          {
            slug: resourceSlug,
            from,
            to,
            interval,
            trailingAvgTime,
          }
        )
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
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });
  return { chartData: data ?? [], isLoading, isFetching, isError, error };
};
