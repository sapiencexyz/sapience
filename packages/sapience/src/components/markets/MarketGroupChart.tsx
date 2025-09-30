'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
} from 'recharts';

import type { MarketGroup as MarketGroupType } from '@sapience/ui/types/graphql';
import { Badge } from '@sapience/ui/components/ui/badge';
import { AnimatePresence, motion } from 'framer-motion';
import LottieLoader from '../shared/LottieLoader';
import ChartLegend from './ChartLegend';
import { useMarketGroupChartData } from '~/hooks/graphql/useMarketGroupChartData';
import {
  useForecasts,
  type FormattedAttestation,
} from '~/hooks/graphql/useForecasts';
import {
  transformMarketGroupChartData,
  getEffectiveMinTimestampFromData,
} from '~/lib/utils/chartUtils';
import { getYAxisConfig, sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import {
  CHART_INDEX_COLOR,
  CHART_SERIES_COLORS,
  getSeriesColorByIndex,
} from '~/lib/theme/chartColors';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { AddressDisplay } from '~/components/shared/AddressDisplay';

interface MarketGroupChartProps {
  chainShortName: string;
  marketAddress: string;
  marketIds: number[];
  market: MarketGroupType | null | undefined; // Use GraphQL type
  minTimestamp?: number;
  optionNames?: string[] | null;
  showForecastDots?: boolean;
  forecastAttester?: string;
}

const MarketGroupChart: React.FC<MarketGroupChartProps> = ({
  chainShortName,
  marketAddress,
  marketIds,
  market,
  minTimestamp,
  optionNames,
  showForecastDots,
  forecastAttester,
}) => {
  const { chartData, isLoading, isError, error } = useMarketGroupChartData({
    chainShortName,
    marketAddress,
    activeMarketIds: marketIds,
    quoteTokenName: market?.quoteTokenName ?? undefined,
    hasResource: !!market?.resource,
  });
  const [hoveredForecastDot, setHoveredForecastDot] = useState<{
    x: number;
    y: number;
    att: FormattedAttestation;
  } | null>(null);
  const hideTooltipTimeoutRef = useRef<number | null>(null);
  const isHoveringInteractiveRef = useRef<boolean>(false);
  const cancelHideTooltip = () => {
    if (hideTooltipTimeoutRef.current != null) {
      window.clearTimeout(hideTooltipTimeoutRef.current);
      hideTooltipTimeoutRef.current = null;
    }
  };
  const scheduleHideTooltip = (delayMs = 180) => {
    // Only schedule if not already scheduled and not over interactive region
    if (
      hideTooltipTimeoutRef.current == null &&
      !isHoveringInteractiveRef.current
    ) {
      hideTooltipTimeoutRef.current = window.setTimeout(() => {
        hideTooltipTimeoutRef.current = null;
        setHoveredForecastDot(null);
      }, delayMs);
    }
  };

  // Forecasts: fetch (before any early returns to keep hooks order stable)
  const { data: forecasts } = useForecasts({
    marketAddress,
    attesterAddress: forecastAttester,
    options: {
      staleTime: 10000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  });

  // Compute effective min timestamp via shared helper (starts at first trade and respects provided min)
  const effectiveMinTimestamp = useMemo(
    () => getEffectiveMinTimestampFromData(chartData, minTimestamp),
    [chartData, minTimestamp]
  );

  // Filter and scale chartData via shared transformer
  const scaledAndFilteredChartData = useMemo(
    () =>
      transformMarketGroupChartData(chartData, {
        minTimestamp,
        startAtFirstTrade: true,
      }),
    [chartData, minTimestamp]
  );

  // Find the latest data point that has a valid indexClose value
  const latestIndexValue = useMemo(() => {
    // Search backwards through the scaled data
    for (let i = scaledAndFilteredChartData.length - 1; i >= 0; i--) {
      const point = scaledAndFilteredChartData[i];
      // Use the scaled value for the check
      if (
        point &&
        typeof point.indexClose === 'number' &&
        !Number.isNaN(point.indexClose)
      ) {
        return point.indexClose;
      }
    }
    return null; // Return null if no valid indexClose found
  }, [scaledAndFilteredChartData]);

  // Compute ticks for X-axis: only the first timestamp per calendar day
  const dailyTicks = useMemo(() => {
    const seenDays = new Set<string>();
    const ticks: number[] = [];
    for (const point of scaledAndFilteredChartData) {
      // Use local date parts to match formatTimestamp
      const date = new Date(point.timestamp * 1000);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      if (!seenDays.has(key)) {
        seenDays.add(key);
        ticks.push(point.timestamp);
      }
    }
    return ticks;
  }, [scaledAndFilteredChartData]);

  // Local formatter for non-padded dates like 9/10
  const formatTimestampCompact = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  // Prepare forecast dots BEFORE any early returns so hooks order is stable
  // Compute classification once; guard against undefined by passing empty object
  const classification = useMemo(
    () => getMarketGroupClassification(market || {}),
    [market]
  );

  const dotsByMarketId = useMemo(() => {
    if (!forecasts || forecasts.length === 0)
      return {} as Record<
        number,
        { timestamp: number; y: number; att: FormattedAttestation }[]
      >;

    const result: Record<
      number,
      { timestamp: number; y: number; att: FormattedAttestation }[]
    > = {};

    for (const att of forecasts) {
      if (!att.marketId) continue;
      const marketIdNum = parseInt(att.marketId, 16);
      if (!marketIds.includes(marketIdNum)) continue;

      let y: number | null = null;
      if (
        classification === MarketGroupClassificationEnum.YES_NO ||
        market?.baseTokenName === 'Yes' ||
        classification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
      ) {
        const priceD18 = sqrtPriceX96ToPriceD18(BigInt(att.value));
        const yesPriceD18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
        const percentageTimes100 =
          Number((priceD18 * 10000n) / yesPriceD18) / 100; // 0..100
        y = percentageTimes100 / 100; // 0..1
      } else {
        const numericD18 = sqrtPriceX96ToPriceD18(BigInt(att.value));
        // For numeric markets, sqrtPriceX96ToPriceD18 returns a value with 18 decimals.
        // Lines are scaled to raw units (Wei / 1e18) by transformMarketGroupChartData,
        // so divide by 1e18 to place dots on the same scale as the lines.
        y = Number(numericD18) / 1e18;
      }

      if (y == null || Number.isNaN(y)) continue;
      const point = { timestamp: att.rawTime, y, att };
      if (!result[marketIdNum]) result[marketIdNum] = [];
      result[marketIdNum].push(point);
    }

    return result;
  }, [forecasts, marketIds, market, classification]);

  // Helpers to render forecast tooltip content anchored to a specific dot
  const renderPredictionBadgeForAtt = (att: FormattedAttestation) => {
    const baseTokenName = market?.baseTokenName || '';
    const quoteTokenName = market?.quoteTokenName || '';

    if (
      classification === MarketGroupClassificationEnum.YES_NO ||
      classification === MarketGroupClassificationEnum.MULTIPLE_CHOICE ||
      baseTokenName.toLowerCase() === 'yes'
    ) {
      try {
        const priceD18 = sqrtPriceX96ToPriceD18(BigInt(att.value));
        const yesD18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
        const percentageD2 = (priceD18 * 10000n) / yesD18;
        const percentage = Math.round(Number(percentageD2) / 100);

        const shouldColor = percentage !== 50;
        const isGreen = shouldColor && percentage > 50;
        const isRed = shouldColor && percentage < 50;
        const variant = shouldColor ? 'outline' : 'default';
        const className = shouldColor
          ? isGreen
            ? 'border-green-500/40 bg-green-500/10 text-green-600'
            : isRed
              ? 'border-red-500/40 bg-red-500/10 text-red-600'
              : ''
          : '';

        return (
          <Badge variant={variant as any} className={className}>
            {`${percentage}% Chance`}
          </Badge>
        );
      } catch (_) {
        // fall through
      }
    }

    if (classification === MarketGroupClassificationEnum.NUMERIC) {
      try {
        const numericD18 = sqrtPriceX96ToPriceD18(BigInt(att.value));
        const numericValue = Number(numericD18) / 1e18; // convert D18 -> base units
        const hideQuote = (quoteTokenName || '').toUpperCase().includes('USD');
        const basePart = baseTokenName ? ` ${baseTokenName}` : '';
        const quotePart =
          !hideQuote && quoteTokenName ? `/${quoteTokenName}` : '';
        const text = `${numericValue.toString()}${basePart}${quotePart}`;
        return <Badge variant="default">{text}</Badge>;
      } catch (_) {
        // fall through
      }
    }

    return <Badge variant="default">{att.value}</Badge>;
  };

  const ForecastTooltipContent: React.FC<{ att: FormattedAttestation }> = ({
    att,
  }) => {
    const comment = (att.comment || '').trim();
    return (
      <div className="rounded-md border border-border bg-background shadow-md p-3 text-xs max-w-[340px] min-w-[320px]">
        {comment ? (
          <div className="text-foreground/90 text-sm leading-snug mb-2 break-words">
            {comment}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0">{renderPredictionBadgeForAtt(att)}</div>
          <div className="grow flex justify-end">
            <AddressDisplay address={att.attester} compact disablePopover />
          </div>
        </div>
      </div>
    );
  };

  // Custom scatter dot to capture precise hover and anchor tooltip to the dot
  const ForecastDotShape = (props: any) => {
    const { cx, cy, payload, ...rest } = props || {};
    const att: FormattedAttestation | undefined = payload?.att;
    const isActive = Boolean(
      hoveredForecastDot &&
        att &&
        ((hoveredForecastDot.att.uid &&
          hoveredForecastDot.att.uid === att.uid) ||
          (hoveredForecastDot.att.id && hoveredForecastDot.att.id === att.id))
    );
    const color = (rest && rest.fill) || undefined;
    return (
      <g
        onMouseEnter={() => {
          isHoveringInteractiveRef.current = true;
          cancelHideTooltip();
          if (
            att &&
            typeof cx === 'number' &&
            typeof cy === 'number' &&
            Number.isFinite(cx) &&
            Number.isFinite(cy)
          ) {
            setHoveredForecastDot({ x: cx, y: cy, att });
          }
        }}
        onMouseLeave={() => {
          isHoveringInteractiveRef.current = false;
          scheduleHideTooltip(180);
        }}
        onFocus={() => {
          isHoveringInteractiveRef.current = true;
          cancelHideTooltip();
          if (
            att &&
            typeof cx === 'number' &&
            typeof cy === 'number' &&
            Number.isFinite(cx) &&
            Number.isFinite(cy)
          ) {
            setHoveredForecastDot({ x: cx, y: cy, att });
          }
        }}
        onBlur={() => {
          isHoveringInteractiveRef.current = false;
          scheduleHideTooltip(60);
        }}
      >
        {/* Glow effect when active */}
        {isActive && color ? (
          <>
            <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.12} />
            <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.18} />
          </>
        ) : null}
        <circle cx={cx} cy={cy} r={isActive ? 3 : 2} {...rest} />
        {/* Larger invisible hit area for easier hover */}
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
      </g>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full md:flex-1 h-full flex items-center justify-center">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full md:flex-1 h-full flex items-center justify-center text-destructive">
        Error loading chart data: {error?.message || 'Unknown error'}
      </div>
    );
  }

  // Check if there's any data to display AFTER processing and filtering
  const hasMarketData = scaledAndFilteredChartData.some(
    (d) =>
      d.markets &&
      Object.keys(d.markets).length > 0 &&
      Object.values(d.markets).some((v) => v != null)
  );
  if (!hasMarketData) {
    return (
      <div className="w-full md:flex-1 h-full flex items-center justify-center text-muted-foreground border border-muted rounded bg-secondary/20">
        <div className="flex flex-col items-center justify-center gap-2">
          <LottieLoader width={40} height={40} className="opacity-80" />
          <span>No wagers yet...</span>
        </div>
      </div>
    );
  }

  // Determine Y-axis configuration based on the market prop
  const yAxisConfig = getYAxisConfig(market);

  // Determine if index data exists to potentially show a second line
  const hasIndexData = scaledAndFilteredChartData.some(
    (d) => d.indexClose != null
  );

  // Get the latest data point overall (for market values and timestamp)
  const overallLatestDataPoint =
    scaledAndFilteredChartData.length > 0
      ? scaledAndFilteredChartData[scaledAndFilteredChartData.length - 1]
      : null;

  // duplicate declaration leftover from refactor — remove to avoid redeclaration

  // Debug: log ranges for series and forecast dots to diagnose flat lines or mis-scaling
  try {
    // Log once per data change

    console.log('[MarketGroupChart] classification/yAxis', {
      classification,
      yAxisDomain: yAxisConfig.domain,
      hasIndexData,
      latestIndexValue,
    });
    const seriesRanges = marketIds.map((id) => {
      const values: number[] = [];
      for (const p of scaledAndFilteredChartData) {
        const v = (p.markets as any)?.[id];
        if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      }
      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      return { marketId: id, count: values.length, min, max };
    });

    console.log('[MarketGroupChart] series ranges', seriesRanges);
    const dotRanges = marketIds.map((id) => {
      const arr = (dotsByMarketId[id] || []).map((d) => d.y);
      const min = arr.length ? Math.min(...arr) : null;
      const max = arr.length ? Math.max(...arr) : null;
      return { marketId: id, count: arr.length, min, max };
    });

    console.log('[MarketGroupChart] forecast dot ranges', dotRanges);

    console.log(
      '[MarketGroupChart] sample points',
      scaledAndFilteredChartData.slice(0, 3)
    );
  } catch (_) {
    // ignore logging errors
  }

  return (
    // Adjust main container for flex column layout and height
    // Ensure this component tries to fill the height allocated by the parent flex container
    <div className="w-full h-full flex flex-col p-4">
      {/* Render the custom legend */}
      <ChartLegend
        latestDataPoint={overallLatestDataPoint}
        latestIndexValue={latestIndexValue}
        marketIds={marketIds}
        hasIndexData={hasIndexData}
        showIndexLine
        lineColors={CHART_SERIES_COLORS}
        indexLineColor={CHART_INDEX_COLOR}
        yAxisConfig={yAxisConfig}
        optionNames={optionNames}
      />
      {/* This div should grow to fill remaining space */}
      <div className="relative flex-1 w-full">
        {/* Let ResponsiveContainer determine height based on parent */}
        <ResponsiveContainer>
          <ComposedChart
            data={scaledAndFilteredChartData}
            margin={{ top: 5, right: 0, left: 0, bottom: 5 }}
            onMouseMove={() => {
              // If a tooltip is open and we're not directly over an interactive element,
              // schedule hide. Only cancel when actually hovering dot/tooltip.
              if (hoveredForecastDot !== null) {
                if (isHoveringInteractiveRef.current) {
                  cancelHideTooltip();
                } else {
                  scheduleHideTooltip(180);
                }
              }
            }}
            onMouseLeave={() => {
              isHoveringInteractiveRef.current = false;
              scheduleHideTooltip(200);
            }}
          >
            <defs>
              {marketIds.map((marketId, index) => {
                const color = getSeriesColorByIndex(index);
                const gradientId = `marketGradient-${marketId}`;
                return (
                  <linearGradient
                    key={gradientId}
                    id={gradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              strokeOpacity={0.2}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              ticks={dailyTicks}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={formatTimestampCompact}
              fontSize={12}
              minTickGap={24}
              dy={10} // Adjust vertical position of ticks
              domain={
                effectiveMinTimestamp
                  ? [
                      effectiveMinTimestamp,
                      scaledAndFilteredChartData.length > 0
                        ? scaledAndFilteredChartData[
                            scaledAndFilteredChartData.length - 1
                          ].timestamp
                        : 'auto',
                    ]
                  : [
                      scaledAndFilteredChartData.length > 0
                        ? scaledAndFilteredChartData[0].timestamp
                        : 'auto',
                      scaledAndFilteredChartData.length > 0
                        ? scaledAndFilteredChartData[
                            scaledAndFilteredChartData.length - 1
                          ].timestamp
                        : 'auto',
                    ]
              }
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={yAxisConfig.tickFormatter}
              fontSize={12}
              dx={0}
              domain={yAxisConfig.domain}
              width={40}
            />
            {/* Keep chart-level tooltip minimal so it doesn't compete with dot tooltips */}
            <Tooltip
              content={() => null}
              wrapperStyle={{ display: 'none' }}
              cursor={false}
            />

            {/* Dynamically render a Line for each marketId */}
            {marketIds.map((marketId) => (
              <Area
                key={`area-${marketId}`}
                type="stepAfter"
                dataKey={`markets.${marketId}`}
                fill={`url(#marketGradient-${marketId})`}
                stroke="none"
                connectNulls
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {marketIds.map((marketId, index) => (
              <Line
                key={marketId} // Use marketId as key
                type="stepAfter"
                dataKey={`markets.${marketId}`} // Dynamic dataKey
                name="Prediction Market" // Updated general name
                stroke={getSeriesColorByIndex(index)} // Cycle through colors
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls // Connect lines across null data points
                isAnimationActive={false}
              />
            ))}

            {showForecastDots !== false &&
              marketIds.map((marketId, index) => (
                <Scatter
                  key={`forecast-dots-${marketId}`}
                  data={dotsByMarketId[marketId] || []}
                  dataKey="y"
                  fill={getSeriesColorByIndex(index)}
                  shape={(props: any) => <ForecastDotShape {...props} />}
                  fillOpacity={0.9}
                  stroke="none"
                  isAnimationActive={false}
                />
              ))}

            {/* Render index line if data exists and toggle is on */}
            {hasIndexData && (
              <Line
                key="indexClose"
                type="stepAfter"
                dataKey="indexClose"
                name="Index"
                stroke={CHART_INDEX_COLOR}
                strokeWidth={2}
                strokeDasharray="5 5"
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        {/* Absolutely positioned tooltip anchored to hovered forecast dot with fade in/out */}
        <AnimatePresence>
          {hoveredForecastDot ? (
            <motion.div
              key={
                hoveredForecastDot.att.uid ||
                hoveredForecastDot.att.id ||
                `${hoveredForecastDot.x}-${hoveredForecastDot.y}`
              }
              className="absolute"
              style={{
                left: hoveredForecastDot.x,
                top: hoveredForecastDot.y,
                transform: 'translate(8px, 8px)',
                zIndex: 60,
              }}
              onMouseEnter={() => {
                isHoveringInteractiveRef.current = true;
                cancelHideTooltip();
              }}
              onMouseLeave={() => {
                isHoveringInteractiveRef.current = false;
                scheduleHideTooltip(60);
              }}
              initial={{ opacity: 0, scale: 0.98, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 2 }}
              exit={{ opacity: 0, scale: 0.98, y: 2 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <div className="pointer-events-auto">
                <ForecastTooltipContent att={hoveredForecastDot.att} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MarketGroupChart;
