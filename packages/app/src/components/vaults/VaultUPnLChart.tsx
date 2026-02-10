'use client';

import { CHAIN_ID_ETHEREAL, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { type ProtocolStat } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import { type Period, PERIOD_DAYS } from '~/components/shared/PeriodFilter';

function formatLargeNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return value.toFixed(1);
  }
  if (value <= -1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value <= -1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (value <= -1) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function formatTimestampTick(value: string): string {
  const date = new Date(parseInt(value, 10) * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

type AnimatedCursorProps = {
  top?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
};

function AnimatedCursor({ points, top, height }: AnimatedCursorProps) {
  if (!points || points.length === 0) return null;

  return (
    <line
      x1={points[0].x}
      y1={top ?? 0}
      x2={points[0].x}
      y2={(top ?? 0) + (height ?? 0)}
      stroke="hsl(var(--brand-white))"
      strokeWidth={1}
      strokeDasharray="1 3"
      className="upnl-chart-cursor"
    />
  );
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    value?: number | string | (number | string)[];
    dataKey?: string | number;
  }>;
  label?: string;
  collateralSymbol: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  collateralSymbol,
}: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === 'upnl');
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const isPositive = value >= 0;
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let dateLabel = '';
  if (label) {
    const date = new Date(parseInt(label, 10) * 1000);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    dateLabel = `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
  }

  return (
    <div className="bg-background border border-border rounded-md px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {dateLabel}
      </div>
      <div
        className={`text-sm font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}
      >
        {isPositive ? '+' : ''}
        {formattedValue} {collateralSymbol}
      </div>
    </div>
  );
}

const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

const CHART_MARGIN = { top: 10, right: 0, left: -15, bottom: 0 };

type VaultUPnLChartProps = {
  protocolStats?: ProtocolStat[];
  isLoading?: boolean;
  height?: number;
  className?: string;
  externalPeriod?: Period;
  showHeader?: boolean;
};

export default function VaultUPnLChart({
  protocolStats,
  isLoading,
  height = 200,
  className,
  externalPeriod,
  showHeader = true,
}: VaultUPnLChartProps) {
  const collateralSymbol = COLLATERAL_SYMBOLS[CHAIN_ID_ETHEREAL] || 'USDe';
  const period = externalPeriod ?? '3M';

  const chartData = useMemo(() => {
    if (!protocolStats || protocolStats.length === 0) return [];

    const periodDays = PERIOD_DAYS[period];
    const cutoffTimestamp =
      periodDays === Infinity
        ? 0
        : Math.floor(Date.now() / 1000) - periodDays * 24 * 60 * 60;

    const filteredStats = protocolStats.filter(
      (stat) => parseInt(stat.timestamp, 10) >= cutoffTimestamp
    );

    if (filteredStats.length === 0) return [];

    return filteredStats.map((point) => ({
      timestamp: point.timestamp,
      upnl: parseFloat(point.vaultUPnL) / 1e18,
      fromRelayer: point.uPnLQuoteFromRelayer,
    }));
  }, [protocolStats, period]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [-1, 1];

    const values = chartData.map((d) => d.upnl);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const range = maxVal - minVal;
    const padding = range * 0.1 || 0.1;

    return [minVal - padding, maxVal + padding];
  }, [chartData]);

  const currentUPnL =
    chartData.length > 0 ? chartData[chartData.length - 1].upnl : 0;
  const isPositive = currentUPnL >= 0;

  const useFlexHeight = className?.includes('flex-1');

  return (
    <div
      className={`w-full ${useFlexHeight ? 'flex flex-col' : ''} ${className ?? ''}`.trim()}
    >
      {showHeader && (
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-base font-mono uppercase tracking-wider text-brand-white">
            Unrealized PnL
          </h4>
        </div>
      )}
      <div
        className={`${useFlexHeight ? 'flex-1' : ''} relative`}
        style={{
          height: useFlexHeight ? undefined : height,
          minHeight: height,
        }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader className="w-6 h-6" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No data for this period
          </div>
        ) : (
          <div className="absolute inset-0 transition-opacity duration-300">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient
                    id="upnlGradientPositive"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="hsl(142 76% 36%)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(142 76% 36%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="upnlGradientNegative"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="hsl(0 84% 60%)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(0 84% 60%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--brand-white) / 0.1)"
                />
                <XAxis
                  dataKey="timestamp"
                  {...CHART_AXIS_STYLE}
                  tickFormatter={formatTimestampTick}
                />
                <YAxis
                  {...CHART_AXIS_STYLE}
                  domain={yDomain}
                  tickFormatter={(v) => formatLargeNumber(v)}
                />
                <Tooltip
                  cursor={<AnimatedCursor />}
                  content={(props) => (
                    <ChartTooltip
                      {...props}
                      collateralSymbol={collateralSymbol}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="upnl"
                  stroke={isPositive ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'}
                  strokeWidth={2}
                  fill={
                    isPositive
                      ? 'url(#upnlGradientPositive)'
                      : 'url(#upnlGradientNegative)'
                  }
                  baseValue={yDomain[0]}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <style jsx>{`
        :global(.upnl-chart-cursor) {
          animation: cursorDash 1.4s linear infinite;
        }
        @keyframes cursorDash {
          to {
            stroke-dashoffset: 8;
          }
        }
      `}</style>
    </div>
  );
}
