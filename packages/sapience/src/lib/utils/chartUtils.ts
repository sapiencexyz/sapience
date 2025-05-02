// Assuming CandleType is defined elsewhere, e.g., in interfaces or generated types
import type { CandleType } from '@foil/ui/types/graphql'; // Adjust path if needed

// Define the type for index candle data (partial CandleType)
// Used because the index query only fetches timestamp and close
export type IndexCandleData = Pick<CandleType, 'timestamp' | 'close'>;

// Define the new data point structure
export interface MultiMarketChartDataPoint {
  timestamp: number;
  markets: {
    // Store close price per market ID (using string keys for object compatibility)
    [marketId: string]: number | undefined;
  };
  indexClose?: number; // Renamed from resourceClose to indexClose
}

// Define the input structure expected from the hook
export interface MarketCandleDataWithId {
  marketId: string;
  candles: CandleType[] | null;
}

// Refactored function
export const processCandleData = (
  marketDataWithIds: MarketCandleDataWithId[], // Input now includes market IDs
  indexCandleData: IndexCandleData[] | null, // Changed type and name
  indexMultiplier: number // Added indexMultiplier, removed quoteTokenName
): MultiMarketChartDataPoint[] => {
  // Use a record keyed by timestamp, holding partial new data points
  const combinedData: Record<
    number,
    Partial<MultiMarketChartDataPoint> & {
      markets: Record<string, number | undefined>;
    }
  > = {};
  const allTimestamps = new Set<number>();

  // Process market candles
  marketDataWithIds.forEach(({ marketId, candles }) => {
    if (candles) {
      candles.forEach((candle) => {
        if (candle.timestamp == null) return; // Skip if timestamp is invalid

        const ts = candle.timestamp;
        allTimestamps.add(ts);

        // Initialize timestamp entry if it doesn't exist
        if (!combinedData[ts]) {
          combinedData[ts] = { timestamp: ts, markets: {} };
        }
        // Ensure markets object exists (should be guaranteed by init, but safety first)
        if (!combinedData[ts].markets) {
          combinedData[ts].markets = {};
        }

        // Attempt to parse the close value
        try {
          const closeValue = parseFloat(String(candle.close));
          if (!Number.isNaN(closeValue)) {
            // Assign value to the specific market ID for this timestamp
            combinedData[ts].markets[marketId] = closeValue;
          } else {
            console.warn(
              `Invalid market close value encountered for market ${marketId}: ${candle.close} at timestamp ${ts}`
            );
            combinedData[ts].markets[marketId] = undefined; // Explicitly mark as undefined
          }
        } catch (e) {
          console.warn(
            `Error parsing market close value for market ${marketId}: ${candle.close} at timestamp ${ts}`,
            e
          );
          combinedData[ts].markets[marketId] = undefined; // Explicitly mark as undefined
        }
      });
    }
  });

  // Process index candles
  if (indexCandleData) {
    indexCandleData.forEach((candle) => {
      if (candle.timestamp == null) return;

      const ts = candle.timestamp;
      allTimestamps.add(ts);
      if (!combinedData[ts]) {
        combinedData[ts] = { timestamp: ts, markets: {} }; // Initialize if only index has this ts
      }
      if (!combinedData[ts].markets) {
        // Ensure markets obj exists
        combinedData[ts].markets = {};
      }

      try {
        const closeValue = parseFloat(String(candle.close));
        if (!Number.isNaN(closeValue)) {
          combinedData[ts]!.indexClose = closeValue * indexMultiplier;
        } else {
          console.warn(
            `Invalid index close value encountered: ${candle.close} at timestamp ${ts}`
          );
        }
      } catch (e) {
        console.warn(
          `Error parsing index close value: ${candle.close} at timestamp ${ts}`,
          e
        );
      }
    });
  }

  // Convert to sorted array
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

  // Map to final MultiMarketChartDataPoint format
  return sortedTimestamps.map((ts) => {
    const point = combinedData[ts];
    // Ensure a complete point structure is returned even if a timestamp had issues
    return {
      timestamp: ts,
      markets: point?.markets ?? {}, // Default to empty object if markets somehow missing
      indexClose: point?.indexClose, // Use indexClose
    };
  });
};

// Remove old ChartDataPoint export if no longer needed elsewhere
// export interface ChartDataPoint { ... }
