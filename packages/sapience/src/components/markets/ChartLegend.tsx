import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
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
  const MARKET_PREDICTION_LABEL = 'Market Prediction';
  const isMultipleChoice = Boolean(optionNames && optionNames.length > 1);

  if (!latestDataPoint) {
    return null; // No data to display legend for
  }

  const formatValue = (value: number | null | undefined) => {
    if (value == null) return '--';
    // Use tooltipValueFormatter directly which includes the unit or % sign
    return yAxisConfig.tooltipValueFormatter(value);
  };

  // Prepare items in the provided order to keep colors/labels consistent
  const items = marketIds.map((marketIdNum, index) => {
    const marketIdStr = String(marketIdNum);
    const value = latestDataPoint?.markets?.[marketIdStr];
    return { marketIdNum, index, value };
  });

  return (
    <div
      className={
        isMultipleChoice
          ? 'flex flex-wrap items-center gap-x-3 gap-y-1 pb-4 text-sm'
          : 'flex flex-col items-start gap-y-1 pb-4 text-sm'
      }
    >
      {items.map(({ marketIdNum, index, value }) => {
        const marketIdStr = String(marketIdNum);
        const color = lineColors[index % lineColors.length];

        // Determine label based on hover state and option names
        let baseLabel: string;
        if (optionNames?.length === 1) {
          baseLabel = MARKET_PREDICTION_LABEL;
        } else {
          baseLabel = optionNames?.[index] ?? MARKET_PREDICTION_LABEL;
        }

        let label: string;
        if (isMultipleChoice) {
          label = baseLabel;
        } else {
          label = `Current ${baseLabel}`;
        }

        const isPercentageMarket = yAxisConfig.unit === '%';
        const itemClassName = `flex items-center gap-1.5 ${
          isMultipleChoice ? '' : 'mb-0.5 sm:text-lg'
        }`;

        return (
          <div key={marketIdStr} className={itemClassName}>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="font-medium text-foreground">
              {formatValue(value)}
              {baseLabel === MARKET_PREDICTION_LABEL &&
              !isMultipleChoice &&
              isPercentageMarket
                ? ' Chance'
                : ''}
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
