import { graphqlRequest } from '@sapience/ui/lib';
import { useEffect, useState } from 'react';

// Import the new structures and the processing function
import type { CandleType } from '@sapience/ui/types/graphql';
import {
  processCandleData, // Use new data point type
  type MarketCandleDataWithId,
  type MultiMarketChartDataPoint, // Use new data point type
} from '../../lib/utils/chartUtils';
import { getChainIdFromShortName } from '../../lib/utils/util'; // Import getChainIdFromShortName

// Adjust marketId type if needed (String! vs Int!) based on schema
const GET_MARKET_CANDLES = /* GraphQL */ `
  query MarketCandles(
    $address: String!
    $chainId: Int!
    $marketId: String! # Assuming String! based on prior schema inspection
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

// Added query for index candles
const GET_INDEX_CANDLES = /* GraphQL */ `
  query IndexCandles(
    $address: String!
    $chainId: Int!
    $marketId: String! # Required by schema, using first active market ID
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

interface UseMarketGroupChartDataProps {
  chainShortName: string;
  marketAddress: string;
  activeMarketIds: number[];
  fromTimestamp?: number; // Optional start time
  toTimestamp?: number; // Optional end time
  quoteTokenName?: string; // Added quoteTokenName prop
  hasResource?: boolean; // Whether market group has an associated resource/index
}

// Update return type
interface UseMarketGroupChartDataReturn {
  chartData: MultiMarketChartDataPoint[]; // Use the new data structure
  isLoading: boolean; // Consolidated loading state
  isError: boolean; // Consolidated error state
  error: Error | null; // Detailed error
}

interface MarketCandlesResponse {
  marketCandles: {
    data: CandleType[] | null;
    lastUpdateTimestamp: number;
  } | null;
}

// Added interface for IndexCandles response
interface IndexCandlesResponse {
  // Updated to match the new structure
  indexCandles: {
    data: Pick<CandleType, 'timestamp' | 'close'>[] | null;
    lastUpdateTimestamp: number;
  } | null;
}

export const useMarketGroupChartData = ({
  chainShortName,
  marketAddress,
  activeMarketIds,
  fromTimestamp: propFromTimestamp, // Use optional prop
  toTimestamp: propToTimestamp, // Use optional prop
  quoteTokenName, // Destructure quoteTokenName
  hasResource = false, // Default to false so we don't fetch index candles unless specified
}: UseMarketGroupChartDataProps): UseMarketGroupChartDataReturn => {
  // Update state type
  const [chartData, setChartData] = useState<MultiMarketChartDataPoint[]>([]);
  // Renaming states to be clearer about candle fetching
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [isErrorCandles, setIsErrorCandles] = useState<boolean>(false);
  const [errorCandles, setErrorCandles] = useState<Error | null>(null);

  const chainId = getChainIdFromShortName(chainShortName); // Calculate chainId outside useEffect
  // Create a stable key so identical contents do not trigger refetch due to new array refs
  const activeMarketIdsKey = Array.isArray(activeMarketIds)
    ? activeMarketIds.join(',')
    : '';

  // Fetch Candle Data based on received activeMarketIds
  useEffect(() => {
    // activeMarketIds is already available from props
    if (!chainId || !marketAddress || activeMarketIds.length === 0) {
      setChartData([]);
      setIsLoadingCandles(false);
      setIsErrorCandles(false); // Not an error state if inputs are just missing/empty
      setErrorCandles(null);
      return;
    }

    // Proceed to fetch candles for the provided IDs
    const fetchCandles = async () => {
      setIsLoadingCandles(true);
      setIsErrorCandles(false);
      setErrorCandles(null);
      setChartData([]);

      const interval = 1800; // 30 minutes in seconds
      const now = Math.floor(Date.now() / 1000);
      const defaultLookbackSeconds = 30 * 24 * 60 * 60; // 30 days
      const overallStartTime =
        propFromTimestamp ?? now - defaultLookbackSeconds;
      const overallEndTime = propToTimestamp ?? now;

      try {
        // Fetch Market Candles for each active market ID
        const marketCandlePromises = activeMarketIds.map(
          async (marketIdNum: number) => {
            const marketIdString = String(marketIdNum); // Convert number to string for consistency
            const from = overallStartTime;
            const to = overallEndTime;

            try {
              const responseData = await graphqlRequest<MarketCandlesResponse>(
                GET_MARKET_CANDLES,
                {
                  address: marketAddress, // Use prop directly
                  chainId, // Use chainId calculated outside
                  marketId: marketIdString, // Use string ID here
                  from,
                  to,
                  interval,
                }
              );

              return {
                marketId: marketIdString,
                candles: responseData.marketCandles?.data ?? [],
                error: null,
              };
            } catch (error) {
              console.error(
                `Error fetching candles for market ${marketIdString}:`,
                error
              );
              return {
                marketId: marketIdString,
                candles: null,
                error:
                  error instanceof Error ? error : new Error('GraphQL error'),
              };
            }
          }
        );

        // Fetch Index Candles only if a resource exists for the market group
        const indexCandlePromise = (async () => {
          if (!hasResource) {
            return [] as Pick<CandleType, 'timestamp' | 'close'>[];
          }
          const firstMarketIdString = String(activeMarketIds[0]);
          const responseData = await graphqlRequest<IndexCandlesResponse>(
            GET_INDEX_CANDLES,
            {
              address: marketAddress,
              chainId,
              marketId: firstMarketIdString,
              from: overallStartTime,
              to: overallEndTime,
              interval,
            }
          );
          return responseData.indexCandles?.data ?? [];
        })();

        // Resolve all promises (market and index)
        const [marketCandleResults, rawIndexCandles] = await Promise.all([
          Promise.all(marketCandlePromises),
          indexCandlePromise, // Get raw index candles
        ]);

        const marketErrors = marketCandleResults
          .map((r) => r.error)
          .filter(Boolean);
        if (marketErrors.length > 0) {
          const combinedError =
            marketErrors[0] || new Error('Unknown error fetching candle data');
          console.error(
            'Errors occurred during candle fetching:',
            combinedError
          );
          throw combinedError; // Throw to be caught below
        }

        // Prepare market data (unchanged)
        const marketDataForProcessing: MarketCandleDataWithId[] =
          marketCandleResults
            .filter((r) => r.candles !== null) // Filter out errors/null data
            .map((r) => ({
              marketId: r.marketId,
              candles: r.candles, // Safe due to filter
            }));

        // Calculate index multiplier: use fixed gwei->wei scaling
        const indexMultiplier: number = 1e9;

        // Process data using the refactored function
        // Pass the RAW index candles and the calculated multiplier
        const processedData = processCandleData(
          marketDataForProcessing,
          rawIndexCandles, // Pass the raw index data
          indexMultiplier // Pass the calculated multiplier
        );
        // Debug instrumentation: log raw candles summary and processed ranges
        try {
          console.log('[useMarketGroupChartData] fetched candles summary', {
            activeMarketIds,
            chainId,
            marketAddress,
            markets: marketDataForProcessing.map((m) => ({
              marketId: m.marketId,
              count: m.candles?.length || 0,
              first: m.candles?.[0]?.close,
              last: m.candles?.[Math.max((m.candles?.length || 1) - 1, 0)]
                ?.close,
            })),
            indexCount: rawIndexCandles?.length || 0,
          });
          const seriesRanges = activeMarketIds.map((id) => {
            const idStr = String(id);
            const values: number[] = [];
            for (const p of processedData) {
              const v = (p.markets as any)?.[idStr];
              if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
            }
            const min = values.length ? Math.min(...values) : null;
            const max = values.length ? Math.max(...values) : null;
            return { marketId: id, count: values.length, min, max };
          });

          console.log(
            '[useMarketGroupChartData] processed ranges (pre-scale)',
            seriesRanges
          );
        } catch (_) {
          // ignore logging errors
        }
        setChartData(processedData); // Set state with the new structure
      } catch (err) {
        console.error('Error fetching or processing candle data:', err);
        setErrorCandles(
          err instanceof Error
            ? err
            : new Error('Failed to fetch/process candle data')
        );
        setIsErrorCandles(true);
        setChartData([]); // Reset with correct type on error
      } finally {
        setIsLoadingCandles(false);
      }
    };

    fetchCandles();
  }, [
    activeMarketIdsKey,
    chainId,
    marketAddress,
    propFromTimestamp,
    propToTimestamp,
    quoteTokenName,
  ]);

  const isLoading = isLoadingCandles;
  const isError = isErrorCandles;
  const error = errorCandles;

  return { chartData, isLoading, isError, error };
};
