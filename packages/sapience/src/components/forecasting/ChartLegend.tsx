import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import type React from 'react';

import type { MultiMarketChartDataPoint } from '~/lib/utils/chartUtils';

interface YAxisConfig {
  tickFormatter: (val: number) => string;
  tooltipValueFormatter: (val: number, unit?: string) => string;
  domain: [number | string, number | string];
  unit: string;
}

interface ChartLegendProps {
  latestDataPoint: MultiMarketChartDataPoint | null;
  latestIndexValue: number | null;
  marketIds: number[];
  hasIndexData: boolean;
  showIndexLine: boolean;
  lineColors: string[];
  indexLineColor: string;
  yAxisConfig: YAxisConfig;
  optionNames?: string[] | null;
}

const ChartLegend: React.FC<ChartLegendProps> = ({
  latestDataPoint,
  latestIndexValue,
  marketIds,
  hasIndexData,
  showIndexLine,
  lineColors,
  indexLineColor,
  yAxisConfig,
  optionNames,
}) => {
  if (!latestDataPoint) {
    return null; // No data to display legend for
  }

  const formatValue = (value: number | null | undefined) => {
    if (value == null) return '--';
    // Use tooltipValueFormatter directly which includes the unit or % sign
    return yAxisConfig.tooltipValueFormatter(value);
  };

  return (
    <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1 pb-4 text-sm">
      {marketIds.map((marketIdNum, index) => {
        const marketIdStr = String(marketIdNum);
        const value = latestDataPoint.markets?.[marketIdStr];
        const color = lineColors[index % lineColors.length];
        const label =
          optionNames?.length === 1
            ? 'Current Market Prediction'
            : (optionNames?.[index] ?? 'Market Prediction');

        return (
          <div key={marketIdStr} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="font-medium text-foreground">
              {formatValue(value)}
            </span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        );
      })}
      {hasIndexData && showIndexLine && (
        <div key="index" className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: indexLineColor, opacity: 0.7 }} // Match line style
          />
          <span className="font-medium text-foreground">
            {formatValue(latestIndexValue)}
          </span>
          <span className="text-muted-foreground">Index</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent>
                <p>The index is the answer to the question so far</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default ChartLegend;
