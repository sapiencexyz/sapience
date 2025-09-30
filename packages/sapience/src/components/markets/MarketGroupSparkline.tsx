'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';

import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';
import {
  transformMarketGroupChartData,
  type MultiMarketChartDataPoint,
  getEffectiveMinTimestampFromData,
} from '~/lib/utils/chartUtils';
import { getYAxisConfig } from '~/lib/utils/util';
import { getSeriesColorByIndex } from '~/lib/theme/chartColors';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';

interface MarketGroupSparklineProps {
  marketIds: number[];
  rawChartData: MultiMarketChartDataPoint[];
  market?: MarketGroupType | null;
  marketClassification?: MarketGroupClassificationEnum;
  minTimestamp?: number;
  width?: number | string;
  height?: number | string;
  showIndexLine?: boolean;
}

const MarketGroupSparklineComponent: React.FC<MarketGroupSparklineProps> = ({
  marketIds,
  rawChartData,
  market,
  marketClassification,
  minTimestamp,
  width = 80,
  height = 40,
  showIndexLine = false,
}) => {
  // Compute effective min timestamp via shared helper
  const effectiveMinTimestamp = React.useMemo(
    () => getEffectiveMinTimestampFromData(rawChartData, minTimestamp),
    [rawChartData, minTimestamp]
  );

  const data = React.useMemo(
    () =>
      transformMarketGroupChartData(rawChartData, {
        minTimestamp,
        startAtFirstTrade: true,
      }),
    [rawChartData, minTimestamp]
  );

  // Debug: log sparkline ranges per series
  try {
    const ranges = marketIds.map((id) => {
      const values: number[] = [];
      for (const p of data) {
        const v = (p.markets as any)?.[String(id)];
        if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      }
      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      return { marketId: id, count: values.length, min, max };
    });

    console.log('[MarketGroupSparkline] ranges', ranges);
  } catch (_) {
    // ignore
  }

  const yAxisDomain = React.useMemo(() => {
    if (
      marketClassification === MarketGroupClassificationEnum.YES_NO ||
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
    ) {
      return [0, 1];
    }
    if (market) {
      return (getYAxisConfig(market).domain as any) || ['auto', 'auto'];
    }
    return ['auto', 'auto'];
  }, [market, marketClassification]);

  const hasMarketData = React.useMemo(() => {
    return data.some((d: MultiMarketChartDataPoint) => {
      return (
        !!d.markets &&
        Object.keys(d.markets).length > 0 &&
        Object.values(d.markets).some((v) => v != null)
      );
    });
  }, [data]);

  if (!hasMarketData) {
    return null;
  }

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="timestamp"
            type="number"
            axisLine={{ stroke: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            tick={false}
            height={0}
            domain={
              effectiveMinTimestamp
                ? [effectiveMinTimestamp, 'auto']
                : ['auto', 'auto']
            }
          />
          <YAxis hide domain={yAxisDomain} />

          {marketIds.map((marketId: number, index: number) => (
            <Line
              key={marketId}
              type="monotone"
              dataKey={`markets.${marketId}`}
              stroke={getSeriesColorByIndex(index)}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {typeof yAxisDomain?.[0] === 'number' && (
            <ReferenceLine
              y={yAxisDomain[0]}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              isFront
            />
          )}
          {showIndexLine && (
            <Line
              key="indexClose"
              type="monotone"
              dataKey="indexClose"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const MarketGroupSparkline = React.memo(MarketGroupSparklineComponent);
MarketGroupSparkline.displayName = 'MarketGroupSparkline';

export default MarketGroupSparkline;
