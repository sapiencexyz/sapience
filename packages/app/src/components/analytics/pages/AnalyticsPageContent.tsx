'use client';

import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { useProtocolAnalytics } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import OpenInterestByCategoryChart from '~/components/analytics/OpenInterestByCategoryChart';
import OpenInterestByTimeToResolutionChart from '~/components/analytics/OpenInterestByTimeToResolutionChart';
import PeriodFilter, { type Period } from '~/components/shared/PeriodFilter';
import {
  bucketStatsByDay,
  filterDataByPeriod,
  formatLargeNumber,
  formatNumber,
} from '~/components/analytics/pages/analyticsFormat';

function formatChartValue(value: number): string {
  return formatLargeNumber(value, 1, false);
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatCountChartValue(value: number): string {
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
  collateralSymbol?: string;
  valueFormatter?: (value: number) => string;
};

function ChartTooltip({
  active,
  payload,
  label,
  dataKey,
  collateralSymbol,
  valueFormatter,
}: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === dataKey);
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const formattedValue = valueFormatter
    ? valueFormatter(value)
    : value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

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
      <div className="text-sm font-mono text-ethena">
        {formattedValue}
        {collateralSymbol ? ` ${collateralSymbol}` : ''}
      </div>
    </div>
  );
}

function formatTimestampTick(value: number): string {
  const date = new Date(value * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

// Match OpenInterestByTimeToResolutionChart's left:-4 so the y-axis labels
// hug the card edge consistently across all charts on the analytics page.
const CHART_MARGIN = { top: 10, right: 4, left: -4, bottom: 0 };

function AnalyticsPageContent(): React.ReactElement {
  const collateralSymbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] || 'USDe';

  // Period states for each chart
  const [volumePeriod, setVolumePeriod] = useState<Period>('1M');
  const [tradeCountPeriod, setTradeCountPeriod] = useState<Period>('1M');
  const [oiPeriod, setOiPeriod] = useState<Period>('1M');
  const [tvlPeriod, setTvlPeriod] = useState<Period>('1M');

  // Fetch protocol-wide analytics: live stats + recorded snapshot series
  const { data: analytics, isLoading: statsLoading } = useProtocolAnalytics();
  const protocolStats = analytics?.statsHistory;

  // Summary cards read the live stats (timestamp = now), not the last
  // recorded snapshot.
  const summary = analytics?.stats ?? null;

  // Undeployed vault funds across ALL vault families, derived from the
  // server's TVL definition: totalValueLocked = escrowBalance + undeployed.
  const undeployedVaultFundsWei = useMemo(() => {
    if (!summary) return '0';
    try {
      return (
        BigInt(summary.totalValueLocked) - BigInt(summary.escrowBalance)
      ).toString();
    } catch {
      return '0';
    }
  }, [summary]);

  // Prepare chart data for protocol stats (TVL, OI)
  const statsChartData = useMemo(() => {
    if (!protocolStats) return [];

    return protocolStats.map((point) => {
      const openInterest = parseFloat(point.openInterest) / 1e18;
      // Server-computed TVL: escrow + undeployed assets across EVERY vault
      // family. Numerically different from the legacy client-side
      // escrow + single-family vaultAvailableAssets sum — intended.
      const protocolTvl = parseFloat(point.totalValueLocked) / 1e18;
      return {
        timestamp: point.timestamp,
        openInterest,
        protocolTvl,
      };
    });
  }, [protocolStats]);

  const volumeChartData = useMemo(() => {
    if (!protocolStats) return [];
    return protocolStats.map((point) => ({
      timestamp: point.timestamp,
      volume: parseFloat(point.periodVolume) / 1e18,
    }));
  }, [protocolStats]);

  const tradeCountChartData = useMemo(() => {
    if (!protocolStats) return [];
    return protocolStats.map((point) => ({
      timestamp: point.timestamp,
      tradeCount: point.periodTradeCount,
    }));
  }, [protocolStats]);

  // Aggregate sub-daily snapshots into UTC-day buckets. The cron interval is
  // configurable and often runs multiple times per day, so without this the
  // "Daily Volume" bar chart shows N bars per day instead of one.
  const filteredVolumeData = useMemo(() => {
    const filtered = filterDataByPeriod(volumeChartData, volumePeriod);
    const byDay = new Map<number, number>();
    for (const point of filtered) {
      const dayStart = Math.floor(point.timestamp / 86400) * 86400;
      byDay.set(dayStart, (byDay.get(dayStart) ?? 0) + point.volume);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([timestamp, volume]) => ({ timestamp, volume }));
  }, [volumeChartData, volumePeriod]);

  const filteredTradeCountData = useMemo(() => {
    const filtered = filterDataByPeriod(tradeCountChartData, tradeCountPeriod);
    const byDay = new Map<number, number>();
    for (const point of filtered) {
      const dayStart = Math.floor(point.timestamp / 86400) * 86400;
      byDay.set(dayStart, (byDay.get(dayStart) ?? 0) + point.tradeCount);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([timestamp, tradeCount]) => ({ timestamp, tradeCount }));
  }, [tradeCountChartData, tradeCountPeriod]);

  // Bucket sub-daily snapshots into UTC days, keeping the last snapshot of
  // each day (closing value) so OI/TVL line charts render one point per day
  // instead of N. OI and TVL are stocks, not flows — picking the last sample
  // matches how end-of-day balances are conventionally reported.
  const filteredOiData = useMemo(
    () => bucketStatsByDay(filterDataByPeriod(statsChartData, oiPeriod)),
    [statsChartData, oiPeriod]
  );

  const filteredTvlData = useMemo(
    () => bucketStatsByDay(filterDataByPeriod(statsChartData, tvlPeriod)),
    [statsChartData, tvlPeriod]
  );

  const isLoading = statsLoading;

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="px-6 py-5">
              <div className="sc-heading text-foreground mb-1 flex items-center gap-1.5">
                Protocol TVL
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto bg-background border border-border p-3"
                    align="start"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase font-mono tracking-wide text-muted-foreground text-xs whitespace-nowrap">
                          Escrow Balance
                        </span>
                        <span className="font-mono whitespace-nowrap text-xl">
                          {formatNumber(summary?.escrowBalance || '0')}{' '}
                          {collateralSymbol}
                        </span>
                      </div>
                      <div className="h-px bg-[hsl(var(--accent-gold)/0.25)]" />
                      <div className="flex flex-col gap-1">
                        <span className="uppercase font-mono tracking-wide text-muted-foreground text-xs whitespace-nowrap">
                          Undeployed Vault Funds
                        </span>
                        <span className="font-mono whitespace-nowrap text-xl">
                          {formatNumber(undeployedVaultFundsWei)}{' '}
                          {collateralSymbol}
                        </span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-xl md:text-2xl font-mono leading-tight flex items-center h-8">
                {isLoading ? (
                  <div className="w-full flex justify-center">
                    <Loader className="w-6 h-6" />
                  </div>
                ) : (
                  <span className="transition-opacity duration-300">
                    {/* Server TVL (all vault families) — see statsChartData note. */}
                    {formatNumber(summary?.totalValueLocked || '0')}{' '}
                    {collateralSymbol}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="px-6 py-5">
              <div className="sc-heading text-foreground mb-1">
                Open Interest
              </div>
              <div className="text-xl md:text-2xl font-mono leading-tight flex items-center h-8">
                {isLoading ? (
                  <div className="w-full flex justify-center">
                    <Loader className="w-6 h-6" />
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
            <CardContent className="px-6 py-5">
              <div className="sc-heading text-foreground mb-1">
                Cumulative Volume
              </div>
              <div className="text-xl md:text-2xl font-mono leading-tight flex items-center h-8">
                {isLoading ? (
                  <div className="w-full flex justify-center">
                    <Loader className="w-6 h-6" />
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

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="px-6 py-5">
              <div className="sc-heading text-foreground mb-1">
                Total Trades
              </div>
              <div className="text-xl md:text-2xl font-mono leading-tight flex items-center h-8">
                {isLoading ? (
                  <div className="w-full flex justify-center">
                    <Loader className="w-6 h-6" />
                  </div>
                ) : (
                  <span className="transition-opacity duration-300">
                    {/* legacy `totalTradeCount` → `cumulativeTradeCount` */}
                    {formatCount(summary?.cumulativeTradeCount ?? 0)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="space-y-4">
          {/* Open Interest distribution: by category + by time-to-resolution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OpenInterestByCategoryChart />
            <OpenInterestByTimeToResolutionChart />
          </div>

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground flex items-center gap-1.5">
                  Daily Volume
                </h3>
                <PeriodFilter value={volumePeriod} onChange={setVolumePeriod} />
              </div>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-8 h-8" />
                  </div>
                ) : filteredVolumeData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={filteredVolumeData}
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
                          width={44}
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

          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground flex items-center gap-1.5">
                  Daily Trades
                </h3>
                <PeriodFilter
                  value={tradeCountPeriod}
                  onChange={setTradeCountPeriod}
                />
              </div>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-8 h-8" />
                  </div>
                ) : filteredTradeCountData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={filteredTradeCountData}
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
                          tickFormatter={formatCountChartValue}
                          width={44}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={<AnimatedCursor />}
                          content={(props) => (
                            <ChartTooltip
                              {...props}
                              dataKey="tradeCount"
                              valueFormatter={formatCount}
                            />
                          )}
                        />
                        <Bar
                          dataKey="tradeCount"
                          fill="hsl(var(--accent-gold) / 0.6)"
                          name="trades"
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground flex items-center gap-1.5">
                  Open Interest
                </h3>
                <PeriodFilter value={oiPeriod} onChange={setOiPeriod} />
              </div>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-8 h-8" />
                  </div>
                ) : filteredOiData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredOiData} margin={CHART_MARGIN}>
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
                          width={44}
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground">Protocol TVL</h3>
                <PeriodFilter value={tvlPeriod} onChange={setTvlPeriod} />
              </div>
              <div className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="w-8 h-8" />
                  </div>
                ) : filteredTvlData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available
                  </div>
                ) : (
                  <div className="w-full h-full transition-opacity duration-300">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredTvlData} margin={CHART_MARGIN}>
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
                          width={44}
                        />
                        <Tooltip
                          cursor={<AnimatedCursor />}
                          content={(props) => (
                            <ChartTooltip
                              {...props}
                              dataKey="protocolTvl"
                              collateralSymbol={collateralSymbol}
                            />
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="protocolTvl"
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
