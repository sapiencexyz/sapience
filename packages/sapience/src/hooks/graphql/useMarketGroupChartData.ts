import { gql } from '@apollo/client'; // Keep for gql tag even if not using Apollo Client hooks
// Removed useQuery import from @tanstack/react-query
import type { CandleType } from '@foil/ui/types';
import { print } from 'graphql';
import { useEffect, useState } from 'react'; // Removed useMemo

// Import the new structures and the processing function
import {
  processCandleData, // Use new data point type
  type MarketCandleDataWithId,
  type MultiMarketChartDataPoint, // Use new data point type
} from '../../lib/utils/chartUtils';
import { foilApi, getChainIdFromShortName } from '../../lib/utils/util'; // Import getChainIdFromShortName
import { useSapience } from '~/lib/context/SapienceProvider'; // Import useSapience

// Define minimal GraphQL error type
interface GraphQLError {
  message: string;
  // Add other common fields like locations, path if needed
}

// Adjust marketId type if needed (String! vs Int!) based on schema
const GET_MARKET_CANDLES = gql`
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
const GET_INDEX_CANDLES = gql`
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
}: UseMarketGroupChartDataProps): UseMarketGroupChartDataReturn => {
  // Update state type
  const [chartData, setChartData] = useState<MultiMarketChartDataPoint[]>([]);
  // Renaming states to be clearer about candle fetching
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [isErrorCandles, setIsErrorCandles] = useState<boolean>(false);
  const [errorCandles, setErrorCandles] = useState<Error | null>(null);

  // Get stEthPerToken from context
  const { stEthPerToken } = useSapience();

  const chainId = getChainIdFromShortName(chainShortName); // Calculate chainId outside useEffect

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
            const response = await foilApi.post('/graphql', {
              query: print(GET_MARKET_CANDLES),
              variables: {
                address: marketAddress, // Use prop directly
                chainId, // Use chainId calculated outside
                marketId: marketIdString, // Use string ID here
                from,
                to,
                interval,
              },
            });
            const responseData = response.data as
              | MarketCandlesResponse
              | { errors?: GraphQLError[] };

            if (
              responseData &&
              'errors' in responseData &&
              responseData.errors
            ) {
              console.error(
                `GraphQL errors fetching candles for market ${marketIdString}:`,
                responseData.errors
              );
              return {
                marketId: marketIdString,
                candles: null,
                error: new Error(
                  responseData.errors[0]?.message || 'GraphQL error'
                ),
              };
            }
            if (responseData && 'marketCandles' in responseData) {
              return {
                marketId: marketIdString,
                candles: responseData.marketCandles?.data ?? [],
                error: null,
              };
            }
            console.warn(
              `Unexpected response structure for market ${marketIdString}:`,
              responseData
            );
            return {
              marketId: marketIdString,
              candles: [],
              error: new Error('Unexpected response structure'),
            };
          }
        );

        // Fetch Index Candles (using the first active marketId)
        const firstMarketIdString = String(activeMarketIds[0]);
        const indexCandlePromise = foilApi
          .post('/graphql', {
            query: print(GET_INDEX_CANDLES),
            variables: {
              address: marketAddress,
              chainId,
              marketId: firstMarketIdString, // Using first market ID
              from: overallStartTime,
              to: overallEndTime,
              interval,
            },
          })
          .then((response) => {
            const responseData = response.data as
              | IndexCandlesResponse
              | { errors?: GraphQLError[] };
            if (
              responseData &&
              'errors' in responseData &&
              responseData.errors &&
              responseData.errors.length > 0
            ) {
              console.error(
                `GraphQL errors fetching index candles:`,
                responseData.errors
              );
              throw new Error(
                responseData.errors[0].message ||
                  'GraphQL error fetching index candles'
              );
            }
            if (responseData && 'indexCandles' in responseData) {
              // Return raw index candles here
              return responseData.indexCandles?.data ?? [];
            }
            console.warn(
              `Unexpected response structure for index candles:`,
              responseData
            );
            return []; // Return empty array on unexpected structure
          })
          .catch((err) => {
            console.error('Error fetching index candles directly:', err);
            throw err; // Ensure failure propagates to Promise.all
          });

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
              candles: r.candles as CandleType[], // Safe due to filter
            }));

        // Calculate index multiplier (unchanged)
        let indexMultiplier: number;
        if (quoteTokenName?.toLowerCase() === 'wsteth') {
          indexMultiplier =
            stEthPerToken && stEthPerToken > 0 ? 1e18 / stEthPerToken : 1e18;
        } else {
          indexMultiplier = 1e9;
        }

        // Process data using the refactored function
        // Pass the RAW index candles and the calculated multiplier
        const processedData = processCandleData(
          marketDataForProcessing,
          rawIndexCandles, // Pass the raw index data
          indexMultiplier // Pass the calculated multiplier
        );
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
    activeMarketIds,
    chainId,
    marketAddress,
    propFromTimestamp,
    propToTimestamp,
    quoteTokenName,
    stEthPerToken,
  ]);

  const isLoading = isLoadingCandles;
  const isError = isErrorCandles;
  const error = errorCandles;

  return { chartData, isLoading, isError, error };
};
