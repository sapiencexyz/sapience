// Assuming CandleType is defined elsewhere, e.g., in interfaces or generated types
import type { CandleType } from '@sapience/ui/types/graphql'; // Adjust path if needed
import { formatEther } from 'viem';

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

        // Convert close (wei string) -> ether number using BigInt + formatEther
        try {
          const closeWei = BigInt(candle.close as any);
          const closeBaseUnits = Number(formatEther(closeWei));
          if (!Number.isNaN(closeBaseUnits)) {
            combinedData[ts].markets[marketId] = closeBaseUnits;
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
        // Index candles are in gwei; convert to wei (x1e9) then to base units
        const gwei = BigInt(candle.close as any);
        const wei = gwei * BigInt(indexMultiplier);
        const baseUnits = Number(formatEther(wei));
        if (!Number.isNaN(baseUnits)) {
          combinedData[ts].indexClose = baseUnits;
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

// Helper: find the first timestamp that has any non-zero market value
export function getFirstTradeTimestamp(
  rawData: MultiMarketChartDataPoint[]
): number | undefined {
  for (let i = 0; i < rawData.length; i++) {
    const point = rawData[i];
    if (
      point?.markets &&
      Object.values(point.markets).some((v) => typeof v === 'number' && v !== 0)
    ) {
      return point.timestamp;
    }
  }
  return undefined;
}

// Helper: compute effective min timestamp given data and an optional provided min
export function getEffectiveMinTimestampFromData(
  rawData: MultiMarketChartDataPoint[],
  providedMinTimestamp?: number
): number | undefined {
  const firstTrade = getFirstTradeTimestamp(rawData);
  if (firstTrade != null && providedMinTimestamp != null) {
    return Math.max(firstTrade, providedMinTimestamp);
  }
  return firstTrade ?? providedMinTimestamp;
}

// Transform raw multi-market chart data into scaled and filtered data used by charts
// - Values are already in base units (wei -> ether) from processing
// - Optionally filters by minTimestamp
// - Converts leading zero market values to undefined to avoid flat lines before first trade
export function transformMarketGroupChartData(
  rawData: MultiMarketChartDataPoint[],
  opts?: { minTimestamp?: number; startAtFirstTrade?: boolean }
): MultiMarketChartDataPoint[] {
  const { minTimestamp, startAtFirstTrade } = opts || {};

  // Derive the effective min timestamp (optionally start at first trade)
  const effectiveMinTimestamp = startAtFirstTrade
    ? getEffectiveMinTimestampFromData(rawData, minTimestamp)
    : minTimestamp;

  const filteredByTimestamp = effectiveMinTimestamp
    ? rawData.filter(
        (dataPoint) => dataPoint.timestamp >= effectiveMinTimestamp
      )
    : rawData;

  const scaledData = filteredByTimestamp.map((point) => {
    // Values already converted to base units; no further scaling needed
    return {
      ...point,
      indexClose: point.indexClose,
      markets: { ...(point.markets || {}) },
    };
  });

  if (scaledData.length === 0) return [];

  // Find first datapoint with any non-zero market value
  let firstNonZeroMarketDataIndex = -1;
  for (let i = 0; i < scaledData.length; i++) {
    const point = scaledData[i];
    if (point.markets && Object.keys(point.markets).length > 0) {
      const hasNonZero = Object.values(point.markets).some(
        (value) => typeof value === 'number' && value !== 0
      );
      if (hasNonZero) {
        firstNonZeroMarketDataIndex = i;
        break;
      }
    }
  }

  return scaledData.map((point, index) => {
    const isLeadingSegment =
      firstNonZeroMarketDataIndex === -1 || index < firstNonZeroMarketDataIndex;
    if (isLeadingSegment && point.markets) {
      const updatedMarkets: { [marketId: string]: number | undefined } = {};
      Object.entries(point.markets).forEach(([marketId, value]) => {
        updatedMarkets[marketId] = value === 0 ? undefined : value;
      });
      return {
        ...point,
        markets: updatedMarkets,
      };
    }
    return point;
  });
}
