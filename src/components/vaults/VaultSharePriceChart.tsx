'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowRightLeft } from 'lucide-react';
import { chartAnchorSecForChain } from './vaultPnlChartUtils';
import {
  buildVaultSharePriceChartData,
  computeSharePriceYDomain,
} from './vaultSharePriceChartUtils';
import { Button } from '~/components/ui/button';
import { Tabs, TabsTrigger } from '~/components/ui/tabs';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '~/lib/sdk/constants';
import type { VaultStat } from '~/hooks/graphql/useAnalytics';
import { useVaultShareQuoteWs } from '~/hooks/ws/useVaultShareQuoteWs';
import { CHART_SERIES_COLORS } from '~/lib/theme/chartColors';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import { type Period } from '~/components/shared/PeriodFilter';
import { useStableYDomain } from '~/components/vaults/useStableYDomain';

function formatTimestampTick(value: number): string {
  const date = new Date(value * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatPrice(value: number): string {
  return value.toFixed(4);
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

  const dataPoint = payload.find((p) => p.dataKey === 'price');
  if (!dataPoint || dataPoint.value == null) return null;

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
      <div className="text-sm font-mono text-brand-white">
        {formatPrice(Number(dataPoint.value))} {collateralSymbol}
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

type VaultSharePriceChartProps = {
  /** Vault stats series (the same one the PnL chart consumes). */
  vaultStats?: VaultStat[];
  /** Vault to stream the live share quote for (appended as a "now" point). */
  vaultAddress?: Address;
  chainId?: number;
  /** Whether the data is loading */
  isLoading?: boolean;
  /** Whether the stats fetch failed (rendered only when no data is available). */
  isError?: boolean;
  /** Chart height in pixels (ignored if className includes flex-1) */
  height?: number;
  /** Additional class names for the container */
  className?: string;
  /** External period control - use instead of internal state when provided */
  externalPeriod?: Period;
  /** Hide entire internal header (title, latest price, tabs). Defaults to true. */
  showHeader?: boolean;
  /** Renders a swap button in the header that switches to the sibling chart. */
  onToggleChart?: () => void;
};

export default function VaultSharePriceChart({
  vaultStats,
  vaultAddress,
  chainId = DEFAULT_CHAIN_ID,
  isLoading,
  isError,
  height = 200,
  className,
  externalPeriod,
  showHeader = true,
  onToggleChart,
}: VaultSharePriceChartProps) {
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'USDe';
  const [internalPeriod, setInternalPeriod] = useState<Period>('ALL');
  const period = externalPeriod ?? internalPeriod;

  // Live MTM quote from the relayer; snapshots are daily, so without this the
  // chart trails the vault by up to a day (and is empty on launch day).
  const liveQuote = useVaultShareQuoteWs({ chainId, vaultAddress });
  const livePrice =
    liveQuote.source === 'ws' ? Number(liveQuote.vaultCollateralPerShare) : NaN;

  // The live quote lands a moment after mount (WS connect + subscribe +
  // relayer replay). Until then a pre-history vault has zero points, which
  // would flash "No share price history yet" — hold the loader through a
  // grace window instead, and only fall back to the empty state if no quote
  // ever arrives (quoter offline).
  const awaitingLiveQuote = Boolean(vaultAddress) && liveQuote.source !== 'ws';
  const [quoteGraceExpired, setQuoteGraceExpired] = useState(false);
  useEffect(() => {
    if (!awaitingLiveQuote) return undefined;
    const timer = setTimeout(() => setQuoteGraceExpired(true), 8_000);
    return () => clearTimeout(timer);
  }, [awaitingLiveQuote]);

  const chartData = useMemo(
    () =>
      buildVaultSharePriceChartData(
        vaultStats,
        period,
        Math.floor(Date.now() / 1000),
        chartAnchorSecForChain(chainId),
        livePrice
      ),
    [vaultStats, period, chainId, livePrice]
  );

  const computedYDomain = useMemo(
    () => computeSharePriceYDomain(chartData.map((d) => d.price)),
    [chartData]
  );
  // The series streams in newest-first, so hold the domain steady while it
  // extends leftward instead of rescaling on every partial page.
  const yDomain = useStableYDomain(
    computedYDomain,
    `${vaultAddress}:${period}`
  );

  // Evenly time-spaced tick positions for the numeric x-axis; recharts' own
  // "nice" numeric ticks land on arbitrary epoch values.
  const xTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const min = chartData[0].timestamp;
    const max = chartData[chartData.length - 1].timestamp;
    if (max <= min) return [min];
    const TICK_COUNT = 5;
    return Array.from(
      { length: TICK_COUNT },
      (_, i) => min + ((max - min) * i) / (TICK_COUNT - 1)
    );
  }, [chartData]);

  const latestPrice =
    chartData.length > 0 ? chartData[chartData.length - 1].price : null;

  const seriesColor = CHART_SERIES_COLORS[0];

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
              Share Price
            </h4>
            {onToggleChart && (
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-1.5 text-muted-foreground/60 hover:text-brand-white [&_svg]:!size-2.5"
                onClick={onToggleChart}
                aria-label="Show profit/loss chart"
              >
                <ArrowRightLeft />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
            <span
              className={`text-base font-mono text-brand-white transition-opacity duration-300 ${latestPrice !== null ? 'opacity-100' : 'opacity-0'}`}
            >
              {latestPrice !== null
                ? `${formatPrice(latestPrice)} ${collateralSymbol}`
                : ' '}
            </span>
            <Tabs
              value={period}
              onValueChange={(v) => setInternalPeriod(v as Period)}
            >
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
        {isLoading ||
        (chartData.length === 0 && awaitingLiveQuote && !quoteGraceExpired) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader className="w-6 h-6" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {isError
              ? 'Error loading chart data'
              : 'No share price history yet'}
          </div>
        ) : (
          <div className="absolute inset-0 transition-opacity duration-300">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient
                    id="sharePriceGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={seriesColor}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={seriesColor}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--brand-white) / 0.1)"
                />
                {/* type="number" spaces points by actual time rather than the
                    default categorical axis — the live "now" point sits at its
                    true distance from the last daily snapshot. */}
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={xTicks}
                  {...CHART_AXIS_STYLE}
                  tickFormatter={formatTimestampTick}
                />
                <YAxis
                  {...CHART_AXIS_STYLE}
                  domain={yDomain}
                  tickFormatter={(v: number) => v.toFixed(3)}
                />
                <Tooltip
                  cursor={{
                    stroke: 'hsl(var(--brand-white))',
                    strokeWidth: 1,
                    strokeDasharray: '1 3',
                  }}
                  content={(props) => (
                    <ChartTooltip
                      {...props}
                      collateralSymbol={collateralSymbol}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={seriesColor}
                  strokeWidth={2}
                  fill="url(#sharePriceGradient)"
                  baseValue={yDomain[0]}
                  dot={
                    chartData.length === 1 ? { r: 4, strokeWidth: 0 } : false
                  }
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
