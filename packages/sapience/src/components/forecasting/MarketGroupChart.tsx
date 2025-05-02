'use client';

import type { MarketGroupType } from '@foil/ui/types/graphql';
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
import { formatTimestamp, getYAxisConfig } from '~/lib/utils/util'; // Import moved functions

import ChartLegend from './ChartLegend';

// Define a simple color palette for the lines
const lineColors = ['#3B82F6', '#F87171', '#4ADE80'];
const indexLineColor = '#3B82F6';

interface MarketGroupChartProps {
  chainShortName: string;
  marketAddress: string;
  marketIds: number[];
  market: MarketGroupType | null | undefined; // Use GraphQL type
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
    quoteTokenName: market?.quoteTokenName ?? undefined,
  });

  // Filter chartData based on minTimestamp if provided
  const filteredChartData = minTimestamp
    ? chartData.filter((dataPoint) => dataPoint.timestamp >= minTimestamp)
    : chartData;

  if (isLoading) {
    return (
      <div className="w-full md:flex-1 h-full flex items-center justify-center">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full md:flex-1 h-full flex items-center justify-center text-destructive">
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
      <div className="w-full md:flex-1 h-full flex items-center justify-center text-muted-foreground border border-muted rounded-md bg-background/50">
        No market data available
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
            data={filteredChartData}
            margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
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
              content={
                <CustomTooltip
                  yAxisConfig={yAxisConfig}
                  optionNames={optionNames}
                />
              }
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

// --- Custom Tooltip Component ---
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: number | string;
  yAxisConfig: ReturnType<typeof getYAxisConfig>;
  optionNames?: string[] | null;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  yAxisConfig,
  optionNames,
}) => {
  if (active && payload && payload.length && label != null) {
    const formattedLabel = formatTimestamp(label as number);

    return (
      <div className="p-3.5 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-md shadow-sm">
        <p className="mb-1.5 font-semibold text-black">{formattedLabel}</p>
        <div className="flex flex-col gap-2 text-sm">
          {payload.map((pld, index) => {
            const marketIdMatch = pld.name?.match(/^markets\.(\d+)$/);
            let displayName: string;

            if (marketIdMatch) {
              const marketIndex = parseInt(marketIdMatch[1], 10);
              // Attempt to use optionNames if available
              displayName =
                optionNames?.[marketIndex] ?? `Option ${marketIndex + 1}`;
            } else if (pld.name === 'indexClose') {
              displayName = 'Index';
            } else {
              displayName = pld.name as string;
            }

            const formattedValue = yAxisConfig.tooltipValueFormatter(
              pld.value as number
            );

            return (
              <div key={`${pld.name}-${index}`} className="flex flex-col">
                <div className="font-medium text-muted-foreground">
                  {displayName}
                </div>
                {formattedValue}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};
// --- End Custom Tooltip Component ---

export default MarketGroupChart;
