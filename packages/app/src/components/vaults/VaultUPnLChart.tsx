'use client';

import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
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
import {
  formatLargeNumber,
  formatTimestampTick,
  AnimatedCursor,
  ChartTooltip,
  CHART_AXIS_STYLE,
  CHART_MARGIN,
  CURSOR_ANIMATION_STYLE,
} from './chartUtils';
import { type ProtocolStat } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import { type Period, PERIOD_DAYS } from '~/components/shared/PeriodFilter';

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
  const collateralSymbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] || 'USDe';
  const period = externalPeriod ?? '3M';

  const chartData = useMemo(() => {
    if (!protocolStats || protocolStats.length === 0) return [];

    const periodDays = PERIOD_DAYS[period];
    const cutoffTimestamp =
      periodDays === Infinity
        ? 0
        : Math.floor(Date.now() / 1000) - periodDays * 24 * 60 * 60;

    const filteredStats = protocolStats.filter(
      (stat) => stat.timestamp >= cutoffTimestamp
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
                      dataKey="upnl"
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

      <style jsx>{CURSOR_ANIMATION_STYLE}</style>
    </div>
  );
}
