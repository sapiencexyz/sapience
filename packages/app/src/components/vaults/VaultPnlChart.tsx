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
  ReferenceLine,
} from 'recharts';
import { useProtocolStats, type ProtocolStat } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import Link from 'next/link';

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
      <div className={`text-sm font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? '+' : ''}{formattedValue} {collateralSymbol}
      </div>
    </div>
  );
}

const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 0 };

type VaultPnlChartProps = {
  /** Optional external protocol stats data. If not provided, will fetch internally. */
  protocolStats?: ProtocolStat[];
  /** Whether the data is loading */
  isLoading?: boolean;
  /** Chart height in pixels */
  height?: number;
  /** Vault address for the portfolio link */
  vaultAddress?: string;
};

export default function VaultPnlChart({
  protocolStats: externalStats,
  isLoading: externalLoading,
  height = 200,
  vaultAddress,
}: VaultPnlChartProps) {
  const collateralSymbol = COLLATERAL_SYMBOLS[CHAIN_ID_ETHEREAL] || 'USDe';

  // Use internal fetch if no external data provided
  const { data: internalStats, isLoading: internalLoading } = useProtocolStats();

  const protocolStats = externalStats ?? internalStats;
  const isLoading = externalLoading ?? internalLoading;

  // Transform protocol stats into PnL chart data
  // For now, using placeholder logic: simulate PnL based on TVL changes
  // This will be replaced with actual PnL data from the resolver
  const chartData = useMemo(() => {
    if (!protocolStats || protocolStats.length === 0) return [];

    // Filter to last 90 days
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const recentStats = protocolStats.filter(
      (stat) => parseInt(stat.timestamp, 10) >= ninetyDaysAgo
    );

    if (recentStats.length === 0) return [];

    // Get the initial TVL as baseline
    const firstStat = recentStats[0];
    const baselineTvl =
      (parseFloat(firstStat.vaultBalance) + parseFloat(firstStat.escrowBalance)) / 1e18;

    return recentStats.map((point, index) => {
      const currentTvl =
        (parseFloat(point.vaultBalance) + parseFloat(point.escrowBalance)) / 1e18;

      // Placeholder PnL calculation: difference from baseline TVL
      // In production, this will come from the actual vaultPnl field
      // Adding some simulated variance for visual effect
      const simulatedPnl = (currentTvl - baselineTvl) * 0.1 +
        Math.sin(index * 0.5) * (currentTvl * 0.02);

      return {
        timestamp: point.timestamp,
        pnl: simulatedPnl,
        tvl: currentTvl,
      };
    });
  }, [protocolStats]);

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
  const currentPnl = chartData.length > 0 ? chartData[chartData.length - 1].pnl : 0;
  const isPositive = currentPnl >= 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
          Vault Profit/Loss
        </h4>
        {vaultAddress && (
          <Link
            href={`/profile/${vaultAddress}`}
            className="text-xs gold-link"
          >
            View Portfolio
          </Link>
        )}
      </div>
      <div style={{ height }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-6 h-6" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <div className="w-full h-full transition-opacity duration-300">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="pnlGradientPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pnlGradientNegative" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
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
                {/* Zero reference line */}
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--brand-white) / 0.3)"
                  strokeDasharray="3 3"
                />
                <Area
                  type="monotone"
                  dataKey="pnl"
                  stroke={isPositive ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'}
                  strokeWidth={2}
                  fill={isPositive ? 'url(#pnlGradientPositive)' : 'url(#pnlGradientNegative)'}
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
