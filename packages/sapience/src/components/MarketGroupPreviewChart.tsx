'use client';

// NOTE: This component requires 'recharts' to be installed in the sapience package
// Run: npm install recharts --save
// Or add it to package.json: "recharts": "^2.12.7"

import { useTheme } from 'next-themes';
import * as React from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
} from 'recharts';

import { useMarketCandles, type Candle } from '~/lib/hooks/useMarketGroups';

// Extend the Candle type for our component
interface ExtendedCandle extends Candle {
  epochId: number;
}

// Define the expected structure of an epoch in the chart
interface ChartEpoch {
  epochId: number;
  chainId: number;
  marketAddress: string;
  question?: string;
  [key: string]: any;
}

export interface MarketGroupPreviewChartProps {
  epochs: ChartEpoch[];
  marketCandles?: Candle[];
  marketInfo?: {
    address: string;
    chainId: number;
    epochId: number;
  };
  isLoading?: boolean;
}

// Chart colors
const CHART_COLORS = [
  '#3F59DA', // Blue
  '#41A53E', // Green
  '#C44444', // Red
  '#9E44C4', // Purple
  '#C49E44', // Orange
];

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const date = new Date(label * 1000);
  const formattedTime = `${date.toLocaleDateString()} ${date.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit' }
  )}`;

  return (
    <div className="bg-card border border-border px-2 py-1 rounded-md shadow-sm text-xs">
      <p className="text-muted-foreground mb-1">{formattedTime}</p>
      {payload.map((entry: any, index: number) => (
        <div key={`item-${index}`} className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-medium">{Number(entry.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Component that renders a Recharts line chart showing
 * the close values for each epoch's market data.
 */
export const MarketGroupPreviewChart: React.FC<
  MarketGroupPreviewChartProps
> = ({ epochs, marketCandles = [], marketInfo, isLoading = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Use directly provided marketCandles instead of fetching
  console.log('MarketGroupPreviewChart: Direct props', {
    marketCandlesLength: marketCandles?.length || 0,
    marketInfoReceived: !!marketInfo,
    marketInfo,
    isLoading,
  });

  // Try to fetch candles directly as a fallback - use explicit null check to ensure the hook runs
  const directFetchEnabled =
    !marketCandles?.length &&
    marketInfo &&
    marketInfo.address &&
    marketInfo.chainId > 0 &&
    marketInfo.epochId > 0;

  console.log('Direct fetch enabled:', directFetchEnabled, marketInfo);

  // Only call the hook when we have valid marketInfo and need to fetch
  const { data: directCandles, isLoading: isDirectLoading } = useMarketCandles({
    address: marketInfo?.address || '',
    chainId: marketInfo?.chainId || 0,
    epochId: marketInfo?.epochId || 0,
  });

  // Log the actual raw candles we're getting
  console.log(
    'Market candles from parent:',
    Array.isArray(marketCandles) ? marketCandles.slice(0, 2) : 'Not an array'
  );
  console.log(
    'Direct candles from fetch:',
    Array.isArray(directCandles) ? directCandles.slice(0, 2) : 'Not an array'
  );

  // Fetch candles for each epoch
  const epochCandlesMap = React.useMemo(() => {
    // If we have no epochs, return empty map
    if (!Array.isArray(epochs) || !epochs.length) {
      return new Map();
    }

    // Create a map to store candles for each epoch
    const candlesMap = new Map();

    // Process parent-provided candles if available
    if (Array.isArray(marketCandles) && marketCandles.length) {
      // Group candles by epoch (assuming marketCandles includes epochId property)
      const groupedCandles = marketCandles.reduce(
        (acc, candle) => {
          const candleWithEpoch = candle as ExtendedCandle;
          if (!acc[candleWithEpoch.epochId]) {
            acc[candleWithEpoch.epochId] = [];
          }
          acc[candleWithEpoch.epochId].push(candle);
          return acc;
        },
        {} as Record<number, Candle[]>
      );

      // Add each epoch's candles to the map
      epochs.forEach((epoch) => {
        if (groupedCandles[epoch.epochId]) {
          candlesMap.set(epoch.epochId, groupedCandles[epoch.epochId]);
        }
      });
    } else if (
      directFetchEnabled &&
      Array.isArray(directCandles) &&
      directCandles.length &&
      marketInfo &&
      marketInfo.epochId
    ) {
      // If using direct fetch, we only have data for one epoch
      // So add it to the current marketInfo epoch
      candlesMap.set(marketInfo.epochId, directCandles);
    }

    return candlesMap;
  }, [epochs, marketCandles, directCandles, directFetchEnabled, marketInfo]);

  // Format and merge candle data for chart display
  const chartData = React.useMemo(() => {
    // If we have epoch candles, transform them for the chart
    if (epochCandlesMap.size > 0) {
      // Find all unique timestamps across all epochs' candles
      const allTimestamps = new Set<number>();
      epochCandlesMap.forEach((candles) => {
        candles.forEach((candle: Candle) => {
          allTimestamps.add(candle.timestamp);
        });
      });

      // Sort timestamps for proper chart rendering
      const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

      // Create a data point for each timestamp with prices from all epochs
      return sortedTimestamps.map((timestamp) => {
        // Start with the timestamp
        const dataPoint: { timestamp: number; [key: string]: number | string } =
          { timestamp };

        // Add each epoch's price for this timestamp if available
        epochs.forEach((epoch) => {
          const epochCandles = epochCandlesMap.get(epoch.epochId);
          if (epochCandles) {
            const candle = epochCandles.find(
              (c: Candle) => c.timestamp === timestamp
            );
            const epochKey = `price_${epoch.epochId}`;
            dataPoint[epochKey] = candle ? parseFloat(candle.close) : NaN;
          }
        });

        return dataPoint;
      });
    }

    // Return empty array if no data available
    console.log('No chart data available');
    return [];
  }, [epochCandlesMap, epochs]);

  console.log('Chart data prepared:', {
    length: chartData.length,
    sampleData: chartData.slice(0, 3),
    epochs: epochs.map((e) => e.epochId),
  });

  // Determine loading state
  const effectivelyLoading = isLoading || isDirectLoading;

  // Now only show loading if we're actively loading data
  if (effectivelyLoading) {
    return (
      <div className="h-32 w-full relative flex items-center justify-center text-muted-foreground bg-muted/50 border border-dashed border-border rounded-md">
        Loading chart data...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
      >
        <defs>
          {/* Generate gradients for each epoch */}
          {epochs.map((epoch, index) => (
            <linearGradient
              key={`gradient-${epoch.epochId}`}
              id={`color-${epoch.epochId}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0.2}
              />
              <stop
                offset="95%"
                stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
        />

        <XAxis
          dataKey="timestamp"
          hide
          type="number"
          domain={['dataMin', 'dataMax']}
        />

        <YAxis hide domain={['auto', 'auto']} />

        <Tooltip content={<CustomTooltip />} />

        {/* Render a line for each epoch */}
        {epochs.map((epoch, index) => (
          <React.Fragment key={`epoch-${epoch.epochId}`}>
            <Area
              type="monotone"
              dataKey={`price_${epoch.epochId}`}
              stroke="none"
              fill={`url(#color-${epoch.epochId})`}
              activeDot={false}
              fillOpacity={1}
              name={`Epoch ${epoch.epochId}`}
            />
            <Line
              type="monotone"
              dataKey={`price_${epoch.epochId}`}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 1 }}
              strokeWidth={2}
              name={epoch.question || `Epoch ${epoch.epochId}`}
              className="font-heading font-normal text-3xl"
              connectNulls
            />
          </React.Fragment>
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
