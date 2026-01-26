'use client';

import { CHAIN_ID_ETHEREAL, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
} from 'recharts';
import {
  useProtocolStats,
  useDailyVolumes,
} from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';

function formatLargeNumber(
  value: number,
  decimals: number,
  useDecimals: boolean
): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(useDecimals ? decimals : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(useDecimals ? decimals : 1)}K`;
  }
  return value.toFixed(useDecimals ? decimals : 0);
}

function formatNumber(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  const humanReadable = num / 1e18;
  return humanReadable.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatChartValue(value: number): string {
  return formatLargeNumber(value, 1, false);
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
      className="analytics-chart-cursor"
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
  dataKey: string;
  collateralSymbol: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  dataKey,
  collateralSymbol,
}: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === dataKey);
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format timestamp (Unix seconds) to date string
  let dateLabel = '';
  if (label) {
    const date = new Date(parseInt(label, 10) * 1000);
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
      <div className="text-sm font-mono text-ethena">
        {formattedValue} {collateralSymbol}
      </div>
    </div>
  );
}

function formatTimestampTick(value: string): string {
  // Parse Unix timestamp (seconds) to date
  const date = new Date(parseInt(value, 10) * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

const CHART_MARGIN = { top: 10, right: 30, left: 0, bottom: 0 };

function AnalyticsPageContent(): React.ReactElement {
  const collateralSymbol = COLLATERAL_SYMBOLS[CHAIN_ID_ETHEREAL] || 'USDe';

  // Fetch protocol stats and daily volumes
  const { data: protocolStats, isLoading: statsLoading } = useProtocolStats();
  const { data: dailyVolumes, isLoading: volumesLoading } = useDailyVolumes();

  // Get summary from the last protocol stat
  const summary = useMemo(() => {
    if (!protocolStats || protocolStats.length === 0) return null;
    return protocolStats[protocolStats.length - 1];
  }, [protocolStats]);

  // Prepare chart data for protocol stats (TVL, OI)
  const statsChartData = useMemo(() => {
    if (!protocolStats) return [];

    return protocolStats.map((point) => {
      const vaultBalance = parseFloat(point.vaultBalance) / 1e18;
      const escrowBalance = parseFloat(point.escrowBalance) / 1e18;
      return {
        timestamp: point.timestamp,
        openInterest: parseFloat(point.openInterest) / 1e18,
        totalBalance: vaultBalance + escrowBalance,
        vaultBalance,
        escrowBalance,
      };
    });
  }, [protocolStats]);

  // Prepare chart data for daily volumes
  const volumeChartData = useMemo(() => {
    if (!dailyVolumes) return [];

    return dailyVolumes.map((point) => ({
      timestamp: point.timestamp,
      volume: parseFloat(point.volume) / 1e18,
    }));
  }, [dailyVolumes]);

  const isLoading = statsLoading || volumesLoading;

  return (
    <div className="relative">
      <div className="container max-w-[1200px] mx-auto px-4 pt-10 md:pt-14 lg:pt-16 pb-12 relative z-10">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-5xl font-sans font-normal text-foreground">
            Analytics
          </h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Protocol TVL
              </div>
              <div className="text-2xl md:text-3xl font-mono h-9 flex items-center">
                {isLoading ? (
                  <div className="w-full flex justify-center pt-3">
                    <Loader size={24} />
                  </div>
                ) : (
                  <span className="transition-opacity duration-300">
                    {formatNumber(
                      String(
                        BigInt(summary?.vaultBalance || '0') +
                          BigInt(summary?.escrowBalance || '0')
                      )
                    )}{' '}
                    {collateralSymbol}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Open Interest
              </div>
              <div className="text-2xl md:text-3xl font-mono h-9 flex items-center">
                {isLoading ? (
                  <div className="w-full flex justify-center pt-3">
                    <Loader size={24} />
                  </div>
                ) : (
                  <span className="transition-opacity duration-300">
                    {formatNumber(summary?.openInterest || '0')}{' '}
                    {collateralSymbol}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Cumulative Volume
              </div>
              <div className="text-2xl md:text-3xl font-mono h-9 flex items-center">
                {isLoading ? (
                  <div className="w-full flex justify-center pt-3">
                    <Loader size={24} />
                  </div>
                ) : (
                  <span className="transition-opacity duration-300">
                    {formatNumber(summary?.cumulativeVolume || '0')}{' '}
                    {collateralSymbol}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="space-y-8">
          {/* Volume Chart - Daily Bar */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <h3 className="sc-heading text-foreground mb-4">Daily Volume</h3>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader size={32} />
                  </div>
                ) : volumeChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={volumeChartData}
                        margin={CHART_MARGIN}
                      >
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
                          tickFormatter={formatChartValue}
                        />
                        <Tooltip
                          cursor={<AnimatedCursor />}
                          content={(props) => (
                            <ChartTooltip
                              {...props}
                              dataKey="volume"
                              collateralSymbol={collateralSymbol}
                            />
                          )}
                        />
                        <Bar
                          dataKey="volume"
                          fill="hsl(var(--ethena) / 0.6)"
                          name="volume"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Open Interest Chart */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <h3 className="sc-heading text-foreground mb-4">Open Interest</h3>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader size={32} />
                  </div>
                ) : statsChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={statsChartData} margin={CHART_MARGIN}>
                        <defs>
                          <linearGradient
                            id="openInterestGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="hsl(var(--ethena))"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(var(--ethena))"
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
                          tickFormatter={formatChartValue}
                        />
                        <Tooltip
                          cursor={<AnimatedCursor />}
                          content={(props) => (
                            <ChartTooltip
                              {...props}
                              dataKey="openInterest"
                              collateralSymbol={collateralSymbol}
                            />
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="openInterest"
                          stroke="hsl(var(--ethena))"
                          strokeWidth={2}
                          fill="url(#openInterestGradient)"
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Protocol TVL Chart */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <h3 className="sc-heading text-foreground mb-4">Protocol TVL</h3>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader size={32} />
                  </div>
                ) : statsChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={statsChartData} margin={CHART_MARGIN}>
                        <defs>
                          <linearGradient
                            id="protocolTVLGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="hsl(var(--accent-gold))"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(var(--accent-gold))"
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
                          tickFormatter={formatChartValue}
                        />
                        <Tooltip
                          cursor={<AnimatedCursor />}
                          content={(props) => (
                            <ChartTooltip
                              {...props}
                              dataKey="totalBalance"
                              collateralSymbol={collateralSymbol}
                            />
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="totalBalance"
                          stroke="hsl(var(--accent-gold))"
                          strokeWidth={2}
                          fill="url(#protocolTVLGradient)"
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        :global(.analytics-chart-cursor) {
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

export default AnalyticsPageContent;
