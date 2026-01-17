'use client';

import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
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
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import {
  useAnalyticsSummary,
  useAnalyticsTimeSeries,
} from '~/hooks/graphql/useAnalytics';

const formatNumber = (value: string | number, decimals = 2): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  // Convert from 18 decimals (wei) to human readable
  const humanReadable = num / 1e18;
  if (humanReadable >= 1_000_000) {
    return `${(humanReadable / 1_000_000).toFixed(decimals)}M`;
  }
  if (humanReadable >= 1_000) {
    return `${(humanReadable / 1_000).toFixed(decimals)}K`;
  }
  return humanReadable.toFixed(decimals);
};

const formatChartValue = (value: number): string => {
  // Value is already in human readable form (divided by 1e18)
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
};

// Custom cursor with animated dots (matching AuctionBidsChart style)
type AnimatedCursorProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  top?: number;
  points?: Array<{ x: number; y: number }>;
};

const AnimatedCursor = ({ points, top, height }: AnimatedCursorProps) => {
  if (!points || points.length === 0) return null;
  const x = points[0].x;
  const y1 = top ?? 0;
  const y2 = y1 + (height ?? 0);

  return (
    <line
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      stroke="hsl(var(--brand-white))"
      strokeWidth={1}
      strokeDasharray="1 3"
      className="analytics-chart-cursor"
    />
  );
};

// Custom tooltip component matching auction row tooltip styles
type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
  dataKey: string;
  collateralSymbol: string;
};

const ChartTooltip = ({
  active,
  payload,
  label,
  dataKey,
  collateralSymbol,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === dataKey);
  if (!dataPoint) return null;

  const value = dataPoint.value;
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format date label with year
  const dateLabel = label
    ? new Date(label).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div className="bg-background border border-border rounded-md px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">{dateLabel}</div>
      <div className="text-sm font-mono text-ethena">
        {formattedValue} {collateralSymbol}
      </div>
    </div>
  );
};

const AnalyticsPageContent = () => {
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'USDe';

  const { data: summary, isLoading: summaryLoading } =
    useAnalyticsSummary(chainId);
  const { data: timeSeries, isLoading: timeSeriesLoading } =
    useAnalyticsTimeSeries(chainId);

  // Transform time series data for charts
  const chartData = useMemo(() => {
    if (!timeSeries) return [];

    return timeSeries.map((point) => ({
      date: point.date,
      dailyVolume: parseFloat(point.dailyVolume) / 1e18,
      openInterest: parseFloat(point.openInterest) / 1e18,
      tvl: parseFloat(point.tvl) / 1e18,
    }));
  }, [timeSeries]);

  const isLoading = summaryLoading || timeSeriesLoading;

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
                Open Interest
              </div>
              <div className="text-2xl md:text-3xl font-mono">
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <>
                    {formatNumber(summary?.openInterest || '0')} {collateralSymbol}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Total Value Locked
              </div>
              <div className="text-2xl md:text-3xl font-mono">
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <>
                    {formatNumber(summary?.tvl || '0')} {collateralSymbol}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Cumulative Volume
              </div>
              <div className="text-2xl md:text-3xl font-mono">
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <>
                    {formatNumber(summary?.totalVolume || '0')} {collateralSymbol}
                  </>
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
                    <span className="animate-pulse text-muted-foreground">
                      Loading...
                    </span>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--brand-white) / 0.1)"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickFormatter={formatChartValue}
                      />
                      <Tooltip
                        cursor={<AnimatedCursor />}
                        content={(props) => (
                          <ChartTooltip
                            {...props}
                            dataKey="dailyVolume"
                            collateralSymbol={collateralSymbol}
                          />
                        )}
                      />
                      <Bar
                        dataKey="dailyVolume"
                        fill="hsl(var(--ethena) / 0.6)"
                        name="dailyVolume"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
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
                    <span className="animate-pulse text-muted-foreground">
                      Loading...
                    </span>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
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
                        dataKey="date"
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* TVL Chart */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <h3 className="sc-heading text-foreground mb-4">Total Value Locked</h3>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <span className="animate-pulse text-muted-foreground">
                      Loading...
                    </span>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="tvlGradient"
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
                        dataKey="date"
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis
                        tick={{
                          fill: 'hsl(var(--muted-foreground))',
                          fontSize: 11,
                        }}
                        axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                        tickFormatter={formatChartValue}
                      />
                      <Tooltip
                        cursor={<AnimatedCursor />}
                        content={(props) => (
                          <ChartTooltip
                            {...props}
                            dataKey="tvl"
                            collateralSymbol={collateralSymbol}
                          />
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="tvl"
                        stroke="hsl(var(--accent-gold))"
                        strokeWidth={2}
                        fill="url(#tvlGradient)"
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
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
};

export default AnalyticsPageContent;
