'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  CartesianGrid,
} from 'recharts';

import LottieLoader from '../shared/LottieLoader'; // Assuming LottieLoader is available
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';

// Define a local type matching the component's usage until correct import path is found
// Copied from PredictionInput.tsx for consistency
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string;
  quoteTokenName?: string;
  isGroupMarket?: boolean;
}

// Helper to format basic number (e.g., for Yes/No markets)
// const formatNumber = (value: number): string => {
//   return value.toFixed(2); // Display probability/normalized value
// };

// Helper to format value as percentage (0-1 -> 0%-100%)
const formatPercentage = (value: number): string => {
  if (value == null || isNaN(value)) return ''; // Handle null/NaN
  return `${(value * 100).toFixed(0)}%`; // Multiply by 100, format, add %
};

// Updated helper to format currency/token value, handling 18 decimals
// Places the unit string AFTER the value
const formatTokenValue = (value: number, unit: string = ''): string => {
  // Adjust for 18 decimals
  const adjustedValue = value / 1e18;
  // Format number and append unit (if provided)
  const formattedNumber = adjustedValue.toFixed(2);
  return unit ? `${formattedNumber} ${unit}` : formattedNumber;
};

// Helper to determine Y-axis configuration based on market type
const getYAxisConfig = (market: PredictionMarketType | null | undefined) => {
  // Check for Yes/No OR Group Market
  if (market?.baseTokenName === 'Yes' || market?.isGroupMarket) {
    // Yes/No or Group market: Percentage 0%-100%
    return {
      tickFormatter: formatPercentage, // Use percentage formatter
      tooltipValueFormatter: (val: number) => formatPercentage(val), // Use percentage formatter
      domain: [0, 1] as [number, number], // Domain remains 0-1 (representing 0% to 100%)
      unit: '%', // Unit symbol (kept for tooltip logic maybe, but not used in tick formatter)
    };
  }

  // Default/Numerical/Group market: Use quote token name, adjust decimals
  // Construct the unit string as base/quote
  let unit = '';
  if (market?.baseTokenName && market?.quoteTokenName) {
    // Construct unit like "quote/base"
    unit = `${market.quoteTokenName}/${market.baseTokenName}`;
  } else if (market?.quoteTokenName) {
    // Fallback to just quote token name if base is missing
    unit = market.quoteTokenName;
  }
  // No default $ sign anymore, handled by formatTokenValue

  return {
    tickFormatter: (val: number) => formatTokenValue(val), // Remove unit from tick formatter call
    tooltipValueFormatter: (val: number) => formatTokenValue(val, unit), // Keep unit for tooltip
    domain: ['auto', 'auto'] as [string | number, string | number], // Auto-scale
    unit, // Keep the constructed unit for potential future use (e.g., tooltips)
  };
};

// Helper to format timestamp for XAxis ticks (example: DD/MM)
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  return `${month}/${day}`;
};

// Define a simple color palette for the lines
const lineColors = ['#3B82F6', '#C084FC'];

interface MarketGroupChartProps {
  chainShortName: string;
  marketAddress: string;
  marketIds: number[];
  market: PredictionMarketType | null | undefined;
  minTimestamp?: number;
}

const MarketGroupChart: React.FC<MarketGroupChartProps> = ({
  chainShortName,
  marketAddress,
  marketIds,
  market,
  minTimestamp,
}) => {
  const { chartData, isLoading, isError, error } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
    quoteTokenName: market?.quoteTokenName,
  });
  const [showIndexLine, setShowIndexLine] = useState(true);

  // Filter chartData based on minTimestamp if provided
  const filteredChartData = minTimestamp
    ? chartData.filter((dataPoint) => dataPoint.timestamp >= minTimestamp)
    : chartData;

  console.log('chartData', chartData);
  console.log('filteredChartData', filteredChartData); // Log filtered data

  if (isLoading) {
    return (
      <div className="w-full md:flex-1 h-[400px] flex items-center justify-center">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full md:flex-1 h-[400px] flex items-center justify-center text-destructive">
        Error loading chart data: {error?.message || 'Unknown error'}
      </div>
    );
  }

  // Check if there's any data to display AFTER processing and filtering
  const hasMarketData = filteredChartData.some(
    (d) =>
      d.markets &&
      Object.keys(d.markets).length > 0 &&
      Object.values(d.markets).some((v) => v != null)
  );
  if (!hasMarketData) {
    return (
      <div className="w-full md:flex-1 h-[400px] flex items-center justify-center text-muted-foreground">
        No chart data available for active markets.
      </div>
    );
  }

  // Determine Y-axis configuration based on the market prop
  const yAxisConfig = getYAxisConfig(market);

  // Determine if index data exists to potentially show a second line
  const hasIndexData = chartData.some((d) => d.indexClose != null);

  return (
    // Removed relative positioning and ComingSoonScrim
    <div className="w-full md:flex-1 h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={filteredChartData} // Use filtered data
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="timestamp"
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTimestamp}
            fontSize={12}
            dy={10} // Adjust vertical position of ticks
            domain={minTimestamp ? [minTimestamp, 'auto'] : ['auto', 'auto']}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={yAxisConfig.tickFormatter}
            fontSize={12}
            dx={-10} // Adjust horizontal position of ticks
            domain={yAxisConfig.domain}
            // Consider width adjustment if currency values get very large
            // width={80} // Example: Adjust width if needed
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
            labelFormatter={(label) => formatTimestamp(label as number)}
            formatter={(value, name) => {
              const marketIdMatch = (name as string)?.match(/^markets\.(\d+)$/);
              let displayName: string;

              if (marketIdMatch) {
                displayName = 'Prediction Market';
              } else if (name === 'Index') {
                displayName = 'Index';
                // Potentially format index differently if needed, for now uses same yAxisConfig
              } else {
                displayName = name as string;
              }
              // Use the determined value formatter from yAxisConfig
              return [
                yAxisConfig.tooltipValueFormatter(value as number),
                displayName,
              ];
            }}
          />
          <Legend
            verticalAlign="top"
            height={36}
            wrapperStyle={{ paddingBottom: '10px' }}
          />

          {/* Button to toggle index line */}
          {hasIndexData && (
            <div
              style={{
                position: 'absolute',
                top: '5px',
                right: '60px',
                zIndex: 10,
              }}
            >
              <button
                type="button"
                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setShowIndexLine(!showIndexLine)}
              >
                {showIndexLine ? 'Hide' : 'Show'} Index Price
              </button>
            </div>
          )}

          {/* Dynamically render a Line for each marketId */}
          {marketIds.map((marketId, index) => (
            <Line
              key={marketId} // Use marketId as key
              type="monotone"
              dataKey={`markets.${marketId}`} // Dynamic dataKey
              name="Prediction Market" // Updated general name
              stroke={lineColors[index % lineColors.length]} // Cycle through colors
              strokeWidth={2}
              dot={false}
              connectNulls // Connect lines across null data points
            />
          ))}

          {/* Render index line if data exists and toggle is on */}
          {hasIndexData && showIndexLine && (
            <Line
              key="indexClose"
              type="monotone"
              dataKey="indexClose"
              name="Index" // Updated name
              stroke={lineColors[1]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarketGroupChart;
