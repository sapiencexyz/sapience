'use client';

import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import {
  useProtocolStats,
  type ProtocolStat,
} from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
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
  return value.toFixed(2);
}

function formatTimestampTick(value: number): string {
  const date = new Date(value * 1000);
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
      className="pnl-chart-cursor"
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

  const dataPoint = payload.find((p) => p.dataKey === 'pnl');
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const isPositive = value >= 0;
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format timestamp (Unix seconds) to date string
  let dateLabel = '';
  if (label != null) {
    const date = new Date(Number(label) * 1000);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
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

type VaultPnlChartProps = {
  /** Optional external protocol stats data. If not provided, will fetch internally. */
  protocolStats?: ProtocolStat[];
  /** Whether the data is loading */
  isLoading?: boolean;
  /** Chart height in pixels (ignored if className includes flex-1) */
  height?: number;
  /** Additional class names for the container */
  className?: string;
  /** External period control - use instead of internal state when provided */
  externalPeriod?: Period;
  /** Hide entire internal header (title, APY, tabs). Defaults to true. */
  showHeader?: boolean;
};

export default function VaultPnlChart({
  protocolStats: externalStats,
  isLoading: externalLoading,
  height = 200,
  className,
  externalPeriod,
  showHeader = true,
}: VaultPnlChartProps) {
  const collateralSymbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] || 'USDe';
  const [internalPeriod, setInternalPeriod] = useState<Period>('1W');
  const period = externalPeriod ?? internalPeriod;
  const setPeriod = setInternalPeriod;

  // Use internal fetch if no external data provided
  const { data: internalStats, isLoading: internalLoading } =
    useProtocolStats();

  const protocolStats = externalStats ?? internalStats;
  const isLoading = externalLoading ?? internalLoading;

  // Transform protocol stats into PnL chart data using real vaultCumulativePnL
  const chartData = useMemo(() => {
    if (!protocolStats || protocolStats.length === 0) return [];

    // Filter based on selected period
    const periodDays = PERIOD_DAYS[period];
    const cutoffTimestamp =
      periodDays === Infinity
        ? 0
        : Math.floor(Date.now() / 1000) - periodDays * 24 * 60 * 60;

    const filteredStats = protocolStats.filter(
      (stat) => stat.timestamp >= cutoffTimestamp
    );

    if (filteredStats.length === 0) return [];

    return filteredStats.map((point) => {
      const currentTvl =
        (parseFloat(point.vaultBalance) + parseFloat(point.escrowBalance)) /
        1e18;

      // Use real vaultCumulativePnL from backend (stored as wei string)
      const pnl = point.vaultCumulativePnL
        ? parseFloat(point.vaultCumulativePnL) / 1e18
        : 0;

      return {
        timestamp: point.timestamp,
        pnl,
        tvl: currentTvl,
      };
    });
  }, [protocolStats, period]);

  // Calculate APY for the selected period based on actual PnL relative to average TVL
  const apy = useMemo(() => {
    if (chartData.length < 2) return null;

    const firstPoint = chartData[0];
    const lastPoint = chartData[chartData.length - 1];

    // Calculate days elapsed
    const startTimestamp = firstPoint.timestamp;
    const endTimestamp = lastPoint.timestamp;
    const daysElapsed = (endTimestamp - startTimestamp) / (24 * 60 * 60);

    // Require minimum 1 day of data for meaningful APY
    if (daysElapsed < 1) return null;

    // Calculate PnL change over the period
    const pnlChange = lastPoint.pnl - firstPoint.pnl;

    // Calculate average TVL over the period
    const avgTvl =
      chartData.reduce((sum, point) => sum + point.tvl, 0) / chartData.length;

    if (avgTvl <= 0) return null;

    // Calculate period return relative to average TVL
    const periodReturn = pnlChange / avgTvl;

    // Annualize: APY = ((1 + periodReturn) ^ (365 / days) - 1) * 100
    const annualizedReturn =
      (Math.pow(1 + periodReturn, 365 / daysElapsed) - 1) * 100;

    return annualizedReturn;
  }, [chartData]);

  // Calculate domain for Y axis - only extend as much as needed for the data
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [-1, 1];

    const pnlValues = chartData.map((d) => d.pnl);
    const minPnl = Math.min(...pnlValues);
    const maxPnl = Math.max(...pnlValues);

    // Add 10% padding to min/max
    const range = maxPnl - minPnl;
    const padding = range * 0.1 || 0.1;

    return [minPnl - padding, maxPnl + padding];
  }, [chartData]);

  // Determine if overall PnL is positive or negative
  const currentPnl =
    chartData.length > 0 ? chartData[chartData.length - 1].pnl : 0;
  const isPositive = currentPnl >= 0;

  // Check if className includes flex-1 to use flexible height
  const useFlexHeight = className?.includes('flex-1');

  return (
    <div
      className={`w-full ${useFlexHeight ? 'flex flex-col' : ''} ${className ?? ''}`.trim()}
    >
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1 sm:gap-2">
          <h4 className="text-base font-mono uppercase tracking-wider text-brand-white">
            Profit/Loss
          </h4>
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <span
              className={`text-base font-mono transition-opacity duration-300 ${apy !== null ? 'opacity-100' : 'opacity-0'} ${apy !== null && apy >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {apy !== null
                ? (apy >= 0 ? '+' : '') + apy.toFixed(1) + '% APY'
                : '\u00A0'}
            </span>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SegmentedTabsList triggerClassName="text-xs px-2 h-7">
                <TabsTrigger value="1W">1W</TabsTrigger>
                <TabsTrigger value="1M">1M</TabsTrigger>
                <TabsTrigger value="3M">3M</TabsTrigger>
                <TabsTrigger value="ALL">ALL</TabsTrigger>
              </SegmentedTabsList>
            </Tabs>
          </div>
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
                    id="pnlGradientPositive"
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
                    id="pnlGradientNegative"
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
                  dataKey="pnl"
                  stroke={isPositive ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'}
                  strokeWidth={2}
                  fill={
                    isPositive
                      ? 'url(#pnlGradientPositive)'
                      : 'url(#pnlGradientNegative)'
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
        :global(.pnl-chart-cursor) {
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
