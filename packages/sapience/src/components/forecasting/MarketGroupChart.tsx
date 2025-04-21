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

// Helper to format timestamp for XAxis ticks (example: DD/MM)
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  return `${month}/${day}`;
};

// Helper to format value for YAxis ticks (example: add $ sign)
const formatCurrency = (value: number): string => {
  // Add basic currency formatting or more complex logic as needed
  return `$${value.toFixed(2)}`;
};

// Define a simple color palette for the lines
const lineColors = [
  'hsl(var(--primary))', // Use theme primary first
  'hsl(var(--secondary))',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#ff00ff', // Added a color for the index line
  // Add more colors if expecting more than 5 market IDs frequently
];

interface MarketGroupChartProps {
  chainShortName: string;
  marketAddress: string;
  marketIds: number[];
}

const MarketGroupChart: React.FC<MarketGroupChartProps> = ({
  chainShortName,
  marketAddress,
  marketIds,
}) => {
  const { chartData, isLoading, isError, error } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
  });
  const [showIndexLine, setShowIndexLine] = useState(true);

  console.log('chartData', chartData);

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

  // Check if there's any data to display AFTER processing
  const hasMarketData = chartData.some(
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

  // Determine if index data exists to potentially show a second line
  const hasIndexData = chartData.some((d) => d.indexClose != null);

  return (
    // Removed relative positioning and ComingSoonScrim
    <div className="w-full md:flex-1 h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
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
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCurrency}
            fontSize={12}
            dx={-10} // Adjust horizontal position of ticks
            domain={['auto', 'auto']} // Auto-scale Y axis
            // Consider width adjustment if currency values get very large
            // width={80} // Example: Adjust width if needed
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
            labelFormatter={(label) => formatTimestamp(label as number)} // Format timestamp in tooltip
            // Updated formatter to handle multiple market lines
            formatter={(value, name) => {
              // name will be the dataKey like "markets.3"
              const marketIdMatch = (name as string)?.match(/^markets\.(\d+)$/);
              let displayName: string;
              if (marketIdMatch) {
                displayName = `Market ${marketIdMatch[1]}`;
              } else if (name === 'indexClose') {
                displayName = 'Index Price';
              } else {
                displayName = name as string;
              }
              return [formatCurrency(value as number), displayName];
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
              name={`Market ${marketId}`} // Dynamic name for Legend/Tooltip
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
              name="Index Price"
              stroke={lineColors[5]} // Use the 6th color (index 5)
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
