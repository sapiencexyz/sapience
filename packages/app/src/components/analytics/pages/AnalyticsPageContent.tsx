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
import { useProtocolStats } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';
import PeriodFilter, {
  type Period,
  PERIOD_DAYS,
} from '~/components/shared/PeriodFilter';
import VaultPnlChart from '~/components/vaults/VaultPnlChart';

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
        {formattedValue} {collateralSymbol}
      </div>
    </div>
  );
}

function formatTimestampTick(value: number): string {
  // Parse Unix timestamp (seconds) to date
  const date = new Date(value * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

const CHART_MARGIN = { top: 10, right: 0, left: 0, bottom: 0 };

function filterDataByPeriod<T extends { timestamp: number }>(
  data: T[],
  period: Period,
  zeroEntry: Omit<T, 'timestamp'>
): T[] {
  const days = PERIOD_DAYS[period];
  if (days === Infinity) return data;

  const now = Math.floor(Date.now() / 1000);
  // Align cutoff to UTC midnight so we don't exclude snapshots that
  // fall on the boundary day (snapshots use UTC midnight timestamps)
  const DAY_SECONDS = 86400;
  const cutoff =
    Math.floor((now - days * DAY_SECONDS) / DAY_SECONDS) * DAY_SECONDS;
  const filtered = data.filter((item) => item.timestamp >= cutoff);

  // Fill missing days with zero entries
  const existingTimestamps = new Set(
    filtered.map((d) => Math.floor(d.timestamp / DAY_SECONDS))
  );
  const filled = [...filtered];
  for (let ts = cutoff; ts <= now; ts += DAY_SECONDS) {
    const dayKey = Math.floor(ts / DAY_SECONDS);
    if (!existingTimestamps.has(dayKey)) {
      filled.push({ ...zeroEntry, timestamp: ts } as T);
    }
  }
  filled.sort((a, b) => a.timestamp - b.timestamp);
  return filled;
}

function AnalyticsPageContent(): React.ReactElement {
  const collateralSymbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] || 'USDe';

  // Period states for each chart
  const [volumePeriod, setVolumePeriod] = useState<Period>('1W');
  const [oiPeriod, setOiPeriod] = useState<Period>('1W');
  const [tvlPeriod, setTvlPeriod] = useState<Period>('1W');
  const [pnlPeriod, setPnlPeriod] = useState<Period>('1W');

  // Fetch protocol stats and daily volumes
  const { data: protocolStats, isLoading: statsLoading } = useProtocolStats();

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
      const vaultDeployed = parseFloat(point.vaultDeployed) / 1e18;
      const escrowBalance = parseFloat(point.escrowBalance) / 1e18;
      return {
        timestamp: point.timestamp,
        openInterest: parseFloat(point.openInterest) / 1e18,
        totalBalance: vaultBalance + escrowBalance,
        vaultBalance,
        vaultDeployed,
        escrowBalance,
      };
    });
  }, [protocolStats]);

  const volumeChartData = useMemo(() => {
    if (!protocolStats) return [];
    return protocolStats.map((point) => ({
      timestamp: point.timestamp,
      volume: parseFloat(point.dailyVolume) / 1e18,
    }));
  }, [protocolStats]);

  // Filter chart data based on selected periods, filling missing days with zeros
  const filteredVolumeData = useMemo(
    () => filterDataByPeriod(volumeChartData, volumePeriod, { volume: 0 }),
    [volumeChartData, volumePeriod]
  );

  const filteredOiData = useMemo(
    () =>
      filterDataByPeriod(statsChartData, oiPeriod, {
        openInterest: 0,
        totalBalance: 0,
        vaultBalance: 0,
        vaultDeployed: 0,
        escrowBalance: 0,
      }),
    [statsChartData, oiPeriod]
  );

  const filteredTvlData = useMemo(
    () =>
      filterDataByPeriod(statsChartData, tvlPeriod, {
        openInterest: 0,
        totalBalance: 0,
        vaultBalance: 0,
        vaultDeployed: 0,
        escrowBalance: 0,
      }),
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-4 md:mb-8">
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2 flex items-center gap-1.5">
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
                          Prediction Market Escrow
                        </span>
                        <span className="font-mono whitespace-nowrap text-xl">
                          {formatNumber(summary?.escrowBalance || '0')}{' '}
                          {collateralSymbol}
                        </span>
                      </div>
                      <div className="h-px bg-[hsl(var(--accent-gold)/0.25)]" />
                      <div className="flex flex-col gap-1">
                        <span className="uppercase font-mono tracking-wide text-muted-foreground text-xs whitespace-nowrap">
                          Protocol Vault Reserve
                        </span>
                        <span className="font-mono whitespace-nowrap text-xl">
                          {formatNumber(summary?.vaultBalance || '0')}{' '}
                          {collateralSymbol}
                        </span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="text-2xl md:text-3xl font-mono h-9 flex items-center">
                {isLoading ? (
                  <div className="w-full flex justify-center pt-3">
                    <Loader className="w-6 h-6" />
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
            <CardContent className="p-6">
              <div className="sc-heading text-foreground mb-2">
                Cumulative Volume
              </div>
              <div className="text-2xl md:text-3xl font-mono h-9 flex items-center">
                {isLoading ? (
                  <div className="w-full flex justify-center pt-3">
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
        </div>

        {/* Charts */}
        <div className="space-y-4 md:space-y-8">
          {/* Volume Chart - Daily Bar */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground flex items-center gap-1.5">
                  Daily Volume
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
                      <p className="text-sm text-muted-foreground">
                        Includes volume from both V1 (legacy) and V2 (escrow)
                        prediction markets.
                      </p>
                    </PopoverContent>
                  </Popover>
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground flex items-center gap-1.5">
                  Open Interest
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
                      <p className="text-sm text-muted-foreground">
                        Includes open interest from both V1 (legacy) and V2
                        (escrow) prediction markets.
                      </p>
                    </PopoverContent>
                  </Popover>
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

          {/* Vault PnL Chart */}
          <Card className="bg-brand-black border border-brand-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="sc-heading text-foreground">
                  Vault Profit/Loss
                </h3>
                <PeriodFilter value={pnlPeriod} onChange={setPnlPeriod} />
              </div>
              <div className="h-[300px]">
                <VaultPnlChart
                  protocolStats={protocolStats}
                  isLoading={statsLoading}
                  externalPeriod={pnlPeriod}
                  showHeader={false}
                  height={300}
                />
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
