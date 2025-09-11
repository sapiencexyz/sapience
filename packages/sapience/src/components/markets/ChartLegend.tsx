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
  hoveredDataPoint?: MultiMarketChartDataPoint | null;
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
  hoveredDataPoint,
}) => {
  const MARKET_PREDICTION_LABEL = 'Market Prediction';
  const displayDataPoint = hoveredDataPoint || latestDataPoint;
  const isMultipleChoice = Boolean(optionNames && optionNames.length > 1);

  if (!displayDataPoint) {
    return null; // No data to display legend for
  }

  const formatValue = (value: number | null | undefined) => {
    if (value == null) return '--';
    // Use tooltipValueFormatter directly which includes the unit or % sign
    return yAxisConfig.tooltipValueFormatter(value);
  };

  // Prepare items and sort if multiple choice
  const items = marketIds
    .map((marketIdNum, index) => {
      const marketIdStr = String(marketIdNum);
      const value = displayDataPoint.markets?.[marketIdStr];
      return { marketIdNum, index, value };
    })
    .sort((a, b) => {
      if (!isMultipleChoice) return 0;
      const aVal = a.value ?? Number.NEGATIVE_INFINITY;
      const bVal = b.value ?? Number.NEGATIVE_INFINITY;
      return bVal - aVal;
    });

  return (
    <div
      className={
        isMultipleChoice
          ? 'flex flex-wrap items-center gap-x-3 gap-y-1 pb-4 text-sm lg:text-base lg:gap-x-4 lg:gap-y-1.5'
          : 'flex flex-col items-start gap-y-1 pb-4 text-sm lg:text-base lg:gap-y-1.5'
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
          label = hoveredDataPoint ? baseLabel : `Current ${baseLabel}`;
        }

        const isPercentageMarket = yAxisConfig.unit === '%';
        const itemClassName = `flex items-center gap-1.5 lg:gap-2 ${
          isMultipleChoice ? '' : 'mb-0.5 text-lg lg:text-xl'
        }`;

        return (
          <div key={marketIdStr} className={itemClassName}>
            <span
              className="h-2.5 w-2.5 rounded-full lg:h-3 lg:w-3"
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
        <div key="index" className="flex items-center gap-1.5 lg:gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full lg:h-3 lg:w-3"
            style={{ backgroundColor: indexLineColor, opacity: 0.7 }} // Match line style
          />
          <span className="font-medium text-foreground">
            {formatValue(
              hoveredDataPoint &&
                typeof hoveredDataPoint.indexClose === 'number'
                ? hoveredDataPoint.indexClose
                : latestIndexValue
            )}
          </span>
          <span className="text-muted-foreground">Index</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-muted-foreground cursor-pointer" />
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
