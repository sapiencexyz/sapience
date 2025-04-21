'use client';

import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  CartesianGrid,
} from 'recharts';

import LottieLoader from '../shared/LottieLoader';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import type { PredictionMarketType } from '~/lib/interfaces/interfaces'; // Updated import
import { formatTimestamp, getYAxisConfig } from '~/lib/utils/util'; // Import moved functions

import ChartLegend from './ChartLegend';

// Define a simple color palette for the lines
const lineColors = ['#3B82F6', '#F87171', '#4ADE80'];
const indexLineColor = '#3B82F6';

interface MarketGroupChartProps {
  chainShortName: string;
  marketAddress: string;
  marketIds: number[];
  market: PredictionMarketType | null | undefined;
  minTimestamp?: number;
  optionNames?: string[] | null;
}

const MarketGroupChart: React.FC<MarketGroupChartProps> = ({
  chainShortName,
  marketAddress,
  marketIds,
  market,
  minTimestamp,
  optionNames,
}) => {
  const { chartData, isLoading, isError, error } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
    quoteTokenName: market?.quoteTokenName,
  });

  // Filter chartData based on minTimestamp if provided
  const filteredChartData = minTimestamp
    ? chartData.filter((dataPoint) => dataPoint.timestamp >= minTimestamp)
    : chartData;

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

  // Get the latest data point for the legend
  const latestDataPoint =
    filteredChartData.length > 0
      ? filteredChartData[filteredChartData.length - 1]
      : null;

  return (
    // Adjust main container for flex column layout and height
    <div className="w-full md:flex-1 flex flex-col min-h-[420px]">
      {/* Render the custom legend */}
      <ChartLegend
        latestDataPoint={latestDataPoint}
        marketIds={marketIds}
        hasIndexData={hasIndexData}
        showIndexLine
        lineColors={lineColors}
        indexLineColor={indexLineColor}
        yAxisConfig={yAxisConfig}
        optionNames={optionNames}
      />
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={filteredChartData} // Use filtered data
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis
              dataKey="timestamp"
              axisLine
              tickLine={false}
              tickFormatter={formatTimestamp}
              fontSize={12}
              dy={10} // Adjust vertical position of ticks
              domain={minTimestamp ? [minTimestamp, 'auto'] : ['auto', 'auto']}
              stroke="rgba(0, 0, 0, 0.5)"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={yAxisConfig.tickFormatter}
              fontSize={12}
              dx={0}
              domain={yAxisConfig.domain}
              width={40}
              stroke="rgba(0, 0, 0, 0.5)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
              }}
              labelFormatter={(label) => formatTimestamp(label as number)}
              formatter={(value, name) => {
                const marketIdMatch = (name as string)?.match(
                  /^markets\.(\d+)$/
                );
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
            {hasIndexData && (
              <Line
                key="indexClose"
                type="monotone"
                dataKey="indexClose"
                name="Index"
                stroke={indexLineColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                strokeOpacity={0.5}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MarketGroupChart;
