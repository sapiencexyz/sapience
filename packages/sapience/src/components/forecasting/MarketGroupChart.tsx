'use client';

import type { MarketGroupType } from '@foil/ui/types/graphql';
import { useMemo } from 'react'; // <-- Import useMemo
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

  // Filter and scale chartData
  const scaledAndFilteredChartData = useMemo(() => {
    const filtered = minTimestamp
      ? chartData.filter((dataPoint) => dataPoint.timestamp >= minTimestamp)
      : chartData;

    // Scale the indexClose value
    return filtered.map((point) => {
      const scaledIndexClose =
        typeof point.indexClose === 'number'
          ? point.indexClose / 1e18 // Scale Wei down by 10^18
          : point.indexClose; // Keep null/undefined as is
      return { ...point, indexClose: scaledIndexClose };
    });
  }, [chartData, minTimestamp]);

  // Find the latest data point that has a valid indexClose value
  const latestIndexValue = useMemo(() => {
    // Search backwards through the scaled data
    for (let i = scaledAndFilteredChartData.length - 1; i >= 0; i--) {
      const point = scaledAndFilteredChartData[i];
      // Use the scaled value for the check
      if (
        point &&
        typeof point.indexClose === 'number' &&
        !isNaN(point.indexClose)
      ) {
        return point.indexClose;
      }
    }
    return null; // Return null if no valid indexClose found
  }, [scaledAndFilteredChartData]);

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
  const hasMarketData = scaledAndFilteredChartData.some(
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
  const hasIndexData = scaledAndFilteredChartData.some(
    (d) => d.indexClose != null
  );

  // Get the latest data point overall (for market values and timestamp)
  const overallLatestDataPoint =
    scaledAndFilteredChartData.length > 0
      ? scaledAndFilteredChartData[scaledAndFilteredChartData.length - 1]
      : null;

  console.log('Latest Data Point for Legend:', overallLatestDataPoint);

  return (
    // Adjust main container for flex column layout and height
    // Ensure this component tries to fill the height allocated by the parent flex container
    <div className="w-full h-full flex flex-col p-4">
      {/* Render the custom legend */}
      <ChartLegend
        latestDataPoint={overallLatestDataPoint}
        latestIndexValue={latestIndexValue}
        marketIds={marketIds}
        hasIndexData={hasIndexData}
        showIndexLine
        lineColors={lineColors}
        indexLineColor={indexLineColor}
        yAxisConfig={yAxisConfig}
        optionNames={optionNames}
      />
      {/* This div should grow to fill remaining space */}
      <div className="flex-1 w-full">
        {/* Let ResponsiveContainer determine height based on parent */}
        <ResponsiveContainer>
          <LineChart
            data={scaledAndFilteredChartData}
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

// Define a more specific type for the tooltip payload item
interface TooltipPayloadItem {
  name?: string; // The key of the data (e.g., 'markets.0', 'indexClose')
  value?: number | string; // The value corresponding to the key
  color?: string; // The color of the corresponding line/bar
  // Add other potential properties if needed, like payload for the raw data point
  payload?: Record<string, unknown>; // Use unknown instead of any
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[]; // Use the specific type
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

            // Safely handle the value type (Refactored from nested ternary)
            let formattedValue: string;
            if (typeof pld.value === 'number') {
              formattedValue = yAxisConfig.tooltipValueFormatter(pld.value);
            } else if (typeof pld.value === 'string') {
              formattedValue = pld.value; // Or handle string values appropriately if needed
            } else {
              formattedValue = 'N/A'; // Default case for unexpected types
            }

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
