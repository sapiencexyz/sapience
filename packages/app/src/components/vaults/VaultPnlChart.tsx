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
import { Button } from '@sapience/ui/components/ui/button';
import {
  useProtocolStats,
  type ProtocolStat,
} from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import { type Period, PERIOD_DAYS } from '~/components/shared/PeriodFilter';

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`;
  }
  if (abs >= 1) {
    return `${sign}${abs.toFixed(1)}`;
  }
  return `${sign}${abs.toFixed(2)}`;
}

function formatPercentTick(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${sign}${formatted}%`;
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

type DisplayMode = 'pct' | 'abs';

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    value?: number | string | (number | string)[];
    dataKey?: string | number;
  }>;
  label?: string;
  collateralSymbol: string;
  displayMode: DisplayMode;
};

function ChartTooltip({
  active,
  payload,
  label,
  collateralSymbol,
  displayMode,
}: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === 'value');
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const isPositive = value >= 0;
  const formattedValue =
    displayMode === 'pct'
      ? `${value.toFixed(2)}%`
      : `${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${collateralSymbol}`;

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
        {formattedValue}
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('abs');

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

    let filteredStats = protocolStats.filter(
      (stat) => stat.timestamp >= cutoffTimestamp
    );

    // For the ALL view, drop leading entries where PnL hasn't started accruing
    // yet (new vault, no activity). Keep the last zero so the chart visually
    // starts at 0 before the first non-zero move.
    if (period === 'ALL') {
      const firstActiveIdx = filteredStats.findIndex(
        (s) => s.vaultCumulativePnL && parseFloat(s.vaultCumulativePnL) !== 0
      );
      if (firstActiveIdx > 0) {
        filteredStats = filteredStats.slice(firstActiveIdx - 1);
      }
    }

    if (filteredStats.length === 0) return [];

    const points = filteredStats.map((point) => {
      const currentTvl =
        (parseFloat(point.vaultBalance) + parseFloat(point.escrowBalance)) /
        1e18;

      const pnl = point.vaultCumulativePnL
        ? parseFloat(point.vaultCumulativePnL) / 1e18
        : 0;

      return {
        timestamp: point.timestamp,
        pnl,
        tvl: currentTvl,
      };
    });

    // Both charts rebase to zero at the window start:
    //   pnlDelta = cumulative PnL accrued since the window start
    //   apy      = compound-annualized return on starting TVL to date
    // Concretely apy_t = ((1 + pnlDelta_t / startTvl)^(365/daysElapsed_t) - 1)
    const startPnl = points[0].pnl;
    const startTvl = points[0].tvl;

    return points.map((p) => {
      const pnlDelta = p.pnl - startPnl;
      const periodReturn = startTvl > 0 ? pnlDelta / startTvl : 0;
      // `pct` is just the $ chart scaled by 1/startTvl, so the % curve has
      // exactly the same shape — only the axis scale differs.
      const pct = periodReturn * 100;
      return { ...p, pnlDelta, pct };
    });
  }, [protocolStats, period]);

  // Headline APY uses wall-clock now for elapsed-days so it doesn't snap to
  // whatever the last snapshot's timestamp is (midnight UTC). Chart points
  // stay on daily granularity; only this annualization sees "now".
  const apy = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    if (first.tvl <= 0) return null;
    const periodReturn = last.pnlDelta / first.tvl;
    if (1 + periodReturn <= 0) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const daysElapsed = (nowSec - first.timestamp) / (24 * 60 * 60);
    if (daysElapsed < 0.5) return null;
    return (Math.pow(1 + periodReturn, 365 / daysElapsed) - 1) * 100;
  }, [chartData]);

  // Recharts animates only when the dataKey and point count stay stable, so
  // project both modes onto a single `value` field. Swapping source makes the
  // area tween between shapes instead of re-rendering from scratch. `pct` is
  // cumulative time-weighted return — monotonic while profitable, so a
  // slowdown reads as flattening rather than descent.
  const displayData = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        value: displayMode === 'pct' ? d.pct : d.pnlDelta,
      })),
    [chartData, displayMode]
  );

  const yDomain = useMemo(() => {
    if (displayData.length === 0) return [-1, 1];

    const values = displayData.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const range = maxVal - minVal;
    const padding = range * 0.1 || (displayMode === 'pct' ? 0.01 : 0.1);

    return [minVal - padding, maxVal + padding];
  }, [displayData, displayMode]);

  const currentValue =
    displayData.length > 0 ? displayData[displayData.length - 1].value : 0;
  const isPositive = currentValue >= 0;

  // Check if className includes flex-1 to use flexible height
  const useFlexHeight = className?.includes('flex-1');

  return (
    <div
      className={`w-full ${useFlexHeight ? 'flex flex-col' : ''} ${className ?? ''}`.trim()}
    >
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1 sm:gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-mono uppercase tracking-wider text-brand-white">
              Profit/Loss
            </h4>
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground/60 hover:text-brand-white"
              onClick={() =>
                setDisplayMode((m) => (m === 'pct' ? 'abs' : 'pct'))
              }
              aria-label="Toggle between percent and absolute"
            >
              {displayMode === 'pct' ? '%' : '$'}
            </Button>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
            <span
              className={`text-base font-mono transition-opacity duration-300 ${apy !== null ? 'opacity-100' : 'opacity-0'} ${apy !== null && apy >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {apy !== null
                ? (apy >= 0 ? '+' : '') +
                  apy.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                  }) +
                  '% APY'
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
              <AreaChart data={displayData} margin={CHART_MARGIN}>
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
                  tickFormatter={(v) => {
                    if (v < 0) return '';
                    return displayMode === 'pct'
                      ? formatPercentTick(v)
                      : `$${formatLargeNumber(v)}`;
                  }}
                />
                <Tooltip
                  cursor={<AnimatedCursor />}
                  content={(props) => (
                    <ChartTooltip
                      {...props}
                      collateralSymbol={collateralSymbol}
                      displayMode={displayMode}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'}
                  strokeWidth={2}
                  fill={
                    isPositive
                      ? 'url(#pnlGradientPositive)'
                      : 'url(#pnlGradientNegative)'
                  }
                  baseValue={yDomain[0]}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={500}
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
