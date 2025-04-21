import { gql } from '@apollo/client'; // Keep for gql tag even if not using Apollo Client hooks
// Removed useQuery import from @tanstack/react-query
import { print } from 'graphql';
import { useEffect, useState } from 'react'; // Removed useMemo

// Assuming types are defined here - adjust path if necessary
import type { CandleType } from '../../lib/interfaces/interfaces';
// Import the new structures and the processing function
import {
  processCandleData,
  type MultiMarketChartDataPoint, // Use new data point type
  type MarketCandleDataWithId, // Use helper type for input
} from '../../lib/utils/chartUtils';
import { foilApi } from '../../lib/utils/util'; // Assuming foilApi is exported from util

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
      timestamp
      open
      high
      low
      close
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
      timestamp
      close # Only need close for the index line
    }
  }
`;

// Utility to get chainId from chain short name (consistent with useMarketGroup.ts)
const getChainIdFromShortName = (shortName: string): number => {
  switch (shortName?.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      console.warn(`Unknown chain short name: ${shortName}`);
      return 0; // Return 0 or handle error appropriately
  }
};

interface UseMarketGroupChartDataProps {
  chainShortName: string;
  marketAddress: string;
  activeMarketIds: number[];
  fromTimestamp?: number; // Optional start time
  toTimestamp?: number; // Optional end time
}

// Update return type
interface UseMarketGroupChartDataReturn {
  chartData: MultiMarketChartDataPoint[]; // Use the new data structure
  isLoading: boolean; // Consolidated loading state
  isError: boolean; // Consolidated error state
  error: Error | null; // Detailed error
}

interface MarketCandlesResponse {
  marketCandles: CandleType[] | null;
}

// Added interface for IndexCandles response
interface IndexCandlesResponse {
  indexCandles: Pick<CandleType, 'timestamp' | 'close'>[] | null;
}

export const useMarketGroupChartData = ({
  chainShortName,
  marketAddress,
  activeMarketIds,
  fromTimestamp: propFromTimestamp, // Use optional prop
  toTimestamp: propToTimestamp, // Use optional prop
}: UseMarketGroupChartDataProps): UseMarketGroupChartDataReturn => {
  // Update state type
  const [chartData, setChartData] = useState<MultiMarketChartDataPoint[]>([]);
  // Renaming states to be clearer about candle fetching
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [isErrorCandles, setIsErrorCandles] = useState<boolean>(false);
  const [errorCandles, setErrorCandles] = useState<Error | null>(null);

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
      // Need to determine time range - how?
      // Option 1: Fetch last X days? Requires adjusting query/logic.
      // Option 2: Assume parent provides start/end if needed?
      // Option 3: Hardcode a range for now? (e.g., last 30 days)
      const now = Math.floor(Date.now() / 1000);
      const defaultLookbackSeconds = 30 * 24 * 60 * 60; // 30 days
      // Use provided timestamps if available, otherwise use default lookback
      const overallStartTime =
        propFromTimestamp ?? now - defaultLookbackSeconds;
      const overallEndTime = propToTimestamp ?? now;

      console.log(
        `Fetching candles for markets ${activeMarketIds.join(', ')} between ${overallStartTime} and ${overallEndTime}`
      );

      try {
        // Fetch Market Candles for each active market ID
        const marketCandlePromises = activeMarketIds.map(
          async (marketIdNum: number) => {
            const marketIdString = String(marketIdNum); // Convert number to string for consistency
            // Use calculated time range
            const from = overallStartTime; // Renamed variable for clarity
            const to = overallEndTime; // Renamed variable for clarity

            const response = await foilApi.post('/graphql', {
              query: print(GET_MARKET_CANDLES),
              variables: {
                address: marketAddress, // Use prop directly
                chainId, // Use chainId calculated outside
                marketId: marketIdString, // Use string ID here
                from, // Use calculated value
                to, // Use calculated value
                interval,
              },
            });
            // Correct the type assertion based on observed structure
            const responseData = response.data as
              | MarketCandlesResponse
              | { errors?: any[] };

            // Remove detailed logging now that the issue is found
            // console.log(`Response for Market ${marketIdString}:`, response);
            // console.log(`Response Data (response.data) for Market ${marketIdString}:`, response.data);
            // console.log(`Parsed responseData for Market ${marketIdString}:`, responseData);
            // console.log(`Accessing responseData.data for Market ${marketIdString}:`, responseData?.data); // This was undefined
            // console.log(`Accessing responseData.data.marketCandles for Market ${marketIdString}:`, responseData?.data?.marketCandles); // This was undefined

            // Check for GraphQL errors (using type guard might be safer)
            if (
              responseData &&
              'errors' in responseData &&
              responseData.errors
            ) {
              console.error(
                `GraphQL errors fetching candles for market ${marketIdString}:`,
                responseData.errors
              );
              // Return marketId along with null candles and error
              return {
                marketId: marketIdString,
                candles: null,
                error: new Error(
                  responseData.errors[0]?.message || 'GraphQL error'
                ),
              };
            }
            // Check if marketCandles exists (using type guard)
            if (responseData && 'marketCandles' in responseData) {
              // Return marketId along with candles - CORRECTED PATH & TYPE SAFE
              return {
                marketId: marketIdString,
                candles: responseData.marketCandles ?? [],
                error: null,
              };
            }
            // Handle cases where neither errors nor marketCandles is present (unexpected response)
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
            // Correct the type assertion
            const responseData = response.data as
              | IndexCandlesResponse
              | { errors?: any[] };
            if (
              responseData &&
              'errors' in responseData &&
              responseData.errors
            ) {
              console.error(
                `GraphQL errors fetching index candles:`,
                responseData.errors
              );
              throw new Error(
                responseData.errors[0]?.message ||
                  'GraphQL error fetching index candles'
              );
            }
            if (responseData && 'indexCandles' in responseData) {
              return responseData.indexCandles ?? [];
            }
            console.warn(
              `Unexpected response structure for index candles:`,
              responseData
            );
            return []; // Return empty array on unexpected structure
          })
          .catch((err) => {
            console.error('Error fetching index candles directly:', err);
            // Rethrow or return null/empty to indicate failure
            throw err; // Ensure failure propagates to Promise.all
          });

        // Resolve all promises (market and index)
        const [marketCandleResults, indexCandles] = await Promise.all([
          Promise.all(marketCandlePromises),
          indexCandlePromise,
        ]);

        // Error handling for overall fetch
        console.log('Raw Market Candle Results:', marketCandleResults);
        console.log('Raw Index Candle Results:', indexCandles); // Log index results
        const marketErrors = marketCandleResults
          .map((r) => r.error)
          .filter(Boolean);
        // const anyError = marketErrors.length > 0;
        if (marketErrors.length > 0) {
          // Check if any errors occurred
          const combinedError =
            marketErrors[0] || new Error('Unknown error fetching candle data');
          console.error(
            'Errors occurred during candle fetching:',
            combinedError
          );
          throw combinedError; // Throw to be caught below
        }

        // Prepare data for the processing function - THIS IS THE KEY CHANGE
        const marketDataForProcessing: MarketCandleDataWithId[] =
          marketCandleResults
            .filter((r) => r.candles !== null) // Filter out any markets that errored or had null data
            .map((r) => ({
              marketId: r.marketId, // Keep the marketId (as string)
              candles: r.candles as CandleType[], // Type assertion safe due to filter
            }));

        // Process data using the refactored function
        // Pass indexCandles data to the processing function
        const processedData = processCandleData(
          marketDataForProcessing,
          indexCandles
        );
        console.log('Processed Chart Data:', processedData);
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

    // Rerun effect if the active IDs or other key identifiers change
    // Use destructured props in dependencies
  }, [
    activeMarketIds,
    chainId,
    marketAddress,
    propFromTimestamp,
    propToTimestamp,
  ]);

  // Consolidate loading and error states - simplified as we removed provider dependency
  const isLoading = isLoadingCandles;
  const isError = isErrorCandles;
  const error = errorCandles;

  return { chartData, isLoading, isError, error };
};
