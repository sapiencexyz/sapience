'use client';

import * as React from 'react';
import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import dynamic from 'next/dynamic';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import MarketBadge from '~/components/markets/MarketBadge';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import type { PredictionData, ForecastData } from './types';

const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

interface PredictionScatterChartProps {
  scatterData: PredictionData[];
  forecastScatterData: ForecastData[];
  isLoading?: boolean;
  wagerRange: { wagerMin: number; wagerMax: number };
  xDomain: [number, number];
  xTicks: number[];
  xTickLabels: Record<number, string>;
}

export function PredictionScatterChart({
  scatterData,
  forecastScatterData,
  isLoading,
  wagerRange,
  xDomain,
  xTicks,
  xTickLabels,
}: PredictionScatterChartProps) {
  // Scatter tooltip hover state - keeps tooltip open when hovering over it
  const [hoveredPoint, setHoveredPoint] = React.useState<PredictionData | null>(
    null
  );
  const [hoveredForecast, setHoveredForecast] =
    React.useState<ForecastData | null>(null);
  const [isTooltipHovered, setIsTooltipHovered] = React.useState(false);
  const isTooltipHoveredRef = React.useRef(false);
  const tooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Comment square hover state - for comment popover
  const [hoveredComment, setHoveredComment] = React.useState<{
    x: number;
    y: number;
    data: PredictionData;
  } | null>(null);
  const commentTooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isCommentTooltipHoveredRef = React.useRef(false);

  const cancelCommentTooltipHide = () => {
    if (commentTooltipTimeoutRef.current) {
      clearTimeout(commentTooltipTimeoutRef.current);
      commentTooltipTimeoutRef.current = null;
    }
  };

  const scheduleCommentTooltipHide = (delayMs = 150) => {
    if (
      commentTooltipTimeoutRef.current == null &&
      !isCommentTooltipHoveredRef.current
    ) {
      commentTooltipTimeoutRef.current = setTimeout(() => {
        commentTooltipTimeoutRef.current = null;
        setHoveredComment(null);
      }, delayMs);
    }
  };

  // Filter predictions that have comments for the comment scatter layer
  const commentScatterData = useMemo(() => {
    return scatterData.filter((d) => d.comment && d.comment.trim().length > 0);
  }, [scatterData]);

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader size={16} />
      </div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 5, left: -10 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--brand-white) / 0.1)"
          />
          <XAxis
            type="number"
            dataKey="x"
            name="Time"
            domain={xDomain}
            ticks={xTicks}
            tickFormatter={(value) => {
              // Find the closest tick label
              const closest = xTicks.reduce((prev, curr) =>
                Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
              );
              return xTickLabels[closest] || '';
            }}
            tick={{
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 11,
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
            axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
            tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Probability"
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 11,
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
            axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
            tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
          />
          <Tooltip
            cursor={false}
            animationDuration={150}
            wrapperStyle={{ pointerEvents: 'auto', zIndex: 50 }}
            active={!!(hoveredPoint || hoveredForecast || isTooltipHovered)}
            payload={
              hoveredPoint
                ? [{ payload: hoveredPoint }]
                : hoveredForecast
                  ? [{ payload: hoveredForecast }]
                  : undefined
            }
            content={({ active, payload }) => {
              // Use hovered point/forecast state for persistent tooltip
              const point =
                hoveredPoint ||
                hoveredForecast ||
                (active &&
                  (payload?.[0]?.payload as
                    | PredictionData
                    | ForecastData
                    | undefined));

              if (!point) return null;

              const date = new Date(point.x);
              const relativeTime = formatDistanceToNow(date, {
                addSuffix: true,
              });
              const exactTime = date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              });
              // Check if this is a forecast (has attester but no predictor/counterparty)
              const isForecast = 'attester' in point && !('predictor' in point);

              const {
                predictor,
                counterparty,
                predictorPrediction,
                combinedPredictions,
                combinedWithYes,
              } = point as PredictionData;
              const yesAddress = predictorPrediction ? predictor : counterparty;
              const noAddress = predictorPrediction ? counterparty : predictor;
              const getCategoryColor = (slug?: string) =>
                getCategoryStyle(slug).color;

              return (
                <div
                  className="rounded-lg border scatter-tooltip overflow-hidden"
                  style={{
                    backgroundColor: 'hsl(var(--brand-black))',
                    border: '1px solid hsl(var(--brand-white) / 0.2)',
                    maxWidth: 300,
                  }}
                  onMouseEnter={() => {
                    if (tooltipTimeoutRef.current) {
                      clearTimeout(tooltipTimeoutRef.current);
                      tooltipTimeoutRef.current = null;
                    }
                    isTooltipHoveredRef.current = true;
                    setIsTooltipHovered(true);
                  }}
                  onMouseLeave={() => {
                    isTooltipHoveredRef.current = false;
                    setIsTooltipHovered(false);
                    tooltipTimeoutRef.current = setTimeout(() => {
                      setHoveredPoint(null);
                      setHoveredForecast(null);
                    }, 100);
                  }}
                >
                  {/* Top section: Time, Forecast, Wager */}
                  <div className="px-3 py-2.5 space-y-1.5">
                    {/* Time row */}
                    <div className="flex items-center justify-between gap-6 h-5">
                      <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                        Time
                      </span>
                      <TooltipProvider>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm text-muted-foreground cursor-help">
                              {relativeTime}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>{exactTime}</span>
                          </TooltipContent>
                        </UITooltip>
                      </TooltipProvider>
                    </div>
                    {/* Forecast row */}
                    <div className="flex items-center justify-between gap-6 h-5">
                      <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                        Forecast
                      </span>
                      <span className="font-mono text-sm text-ethena">
                        {!isForecast &&
                          combinedPredictions &&
                          combinedPredictions.length > 0 &&
                          `${combinedWithYes === false ? '<' : '>'}`}
                        {Math.round(point.y)}% chance
                      </span>
                    </div>
                    {/* Wager row - only for predictions */}
                    {!isForecast && 'wager' in point && (
                      <div className="flex items-center justify-between gap-6 h-5">
                        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                          Wager
                        </span>
                        <span className="text-sm text-foreground">
                          {point.wager.toFixed(2)} USDe
                        </span>
                      </div>
                    )}
                    {/* Forecaster row - only for forecasts */}
                    {isForecast && (
                      <div className="flex items-center justify-between gap-6 h-5">
                        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                          Forecaster
                        </span>
                        <div className="flex items-center gap-1.5">
                          <EnsAvatar
                            address={point.attester}
                            width={16}
                            height={16}
                          />
                          <AddressDisplay address={point.attester} compact />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comment section - for forecasts */}
                  {isForecast && point.comment && (
                    <>
                      <div className="border-t border-brand-white/10" />
                      <div className="px-3 py-2.5">
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">
                          Comment
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                          <SafeMarkdown
                            content={point.comment}
                            className="prose prose-invert prose-sm max-w-none"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Divider - only for predictions */}
                  {!isForecast && (
                    <div className="border-t border-brand-white/10" />
                  )}

                  {/* Middle section: YES/NO predictors - only for predictions */}
                  {!isForecast && (
                    <div className="px-3 py-2.5 space-y-2">
                      {/* YES predictor */}
                      <div className="flex items-center justify-between gap-4">
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0 font-mono"
                        >
                          YES
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          <EnsAvatar
                            address={yesAddress}
                            width={16}
                            height={16}
                          />
                          <AddressDisplay address={yesAddress} compact />
                        </div>
                      </div>
                      {/* NO predictor */}
                      <div className="flex items-center justify-between gap-4">
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0 font-mono"
                        >
                          NO
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          <EnsAvatar
                            address={noAddress}
                            width={16}
                            height={16}
                          />
                          <AddressDisplay address={noAddress} compact />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Combined predictions section (if parlay) */}
                  {!isForecast &&
                    combinedPredictions &&
                    combinedPredictions.length > 0 && (
                      <>
                        <div className="border-t border-brand-white/10" />
                        <div className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                              Combined
                            </span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
                                >
                                  {combinedPredictions.length} prediction
                                  {combinedPredictions.length !== 1 ? 's' : ''}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                                align="start"
                              >
                                <div className="flex flex-col divide-y divide-brand-white/20">
                                  <div className="flex items-center gap-3 px-3 py-2">
                                    <span className="text-sm text-brand-white">
                                      Predicted with
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                        combinedWithYes
                                          ? 'border-yes/40 bg-yes/10 text-yes'
                                          : 'border-no/40 bg-no/10 text-no'
                                      }`}
                                    >
                                      {combinedWithYes ? 'YES' : 'NO'}
                                    </Badge>
                                  </div>
                                  {combinedPredictions.map((pred, i) => (
                                    <div
                                      key={`scatter-combined-${i}`}
                                      className="flex items-center gap-3 px-3 py-2"
                                    >
                                      <MarketBadge
                                        label={pred.question}
                                        size={32}
                                        color={getCategoryColor(
                                          pred.categorySlug
                                        )}
                                        categorySlug={pred.categorySlug}
                                      />
                                      <span className="text-sm flex-1 min-w-0 font-mono underline decoration-dotted underline-offset-2 hover:text-brand-white/80 transition-colors cursor-pointer truncate">
                                        {pred.question}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                                          pred.prediction
                                            ? 'border-yes/40 bg-yes/10 text-yes'
                                            : 'border-no/40 bg-no/10 text-no'
                                        }`}
                                      >
                                        {pred.prediction ? 'YES' : 'NO'}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </>
                    )}
                </div>
              );
            }}
          />
          <Scatter
            name="Predictions"
            data={scatterData}
            fill="hsl(var(--ethena))"
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              // Scale wager to radius: min 4px, max 20px
              // Use actual wager range from data
              const minR = 4;
              const maxR = 20;
              const { wagerMin, wagerMax } = wagerRange;
              const wager = payload?.wager ?? 0;

              // Normalize wager to the calculated range
              const normalizedWager = Math.max(
                wagerMin,
                Math.min(wagerMax, wager)
              );

              // Calculate radius based on normalized wager
              const wagerRangeSize = wagerMax - wagerMin;
              const radius =
                wagerRangeSize > 0
                  ? minR +
                    ((normalizedWager - wagerMin) / wagerRangeSize) *
                      (maxR - minR)
                  : minR; // Fallback if range is 0

              // Check if this is a combined prediction (parlay)
              if (payload?.combinedPredictions?.length > 0) {
                // Render horizontal line with gradient ray
                const width = radius * 2.5;
                const lineWidth = width * 2;
                const rayLength = lineWidth * 0.6; // Ray height proportional to line width
                const gradientId = `bracket-ray-gradient-${payload.x}`;
                const lineGradientId = `bracket-line-gradient-${payload.x}`;
                // Determine ray direction based on the combo "bound" meaning:
                // - Predictor bets YES on this question => displayed value is a LOWER bound on P(YES) => ray UP (chance could be greater)
                // - Predictor bets NO on this question  => displayed value is an UPPER bound on P(YES) => ray DOWN (chance could be lesser)
                const rayUp = payload.predictorPrediction === true;
                return (
                  <g
                    className="bracket-combined"
                    onMouseEnter={() => {
                      if (tooltipTimeoutRef.current) {
                        clearTimeout(tooltipTimeoutRef.current);
                        tooltipTimeoutRef.current = null;
                      }
                      setHoveredPoint(payload as PredictionData);
                    }}
                    onMouseLeave={() => {
                      // Delay clearing to allow moving to tooltip
                      tooltipTimeoutRef.current = setTimeout(() => {
                        if (!isTooltipHoveredRef.current) {
                          setHoveredPoint(null);
                        }
                      }, 150);
                    }}
                  >
                    {/* Radial gradient definition for the semicircle ray */}
                    <defs>
                      <radialGradient
                        id={gradientId}
                        cx="50%"
                        cy={rayUp ? '100%' : '0%'}
                        r="100%"
                        fx="50%"
                        fy={rayUp ? '100%' : '0%'}
                      >
                        {/* Smooth exponential fadeout with many stops */}
                        <stop
                          offset="0%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="1"
                        />
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.85"
                        />
                        <stop
                          offset="10%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.7"
                        />
                        <stop
                          offset="15%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.55"
                        />
                        <stop
                          offset="20%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.45"
                        />
                        <stop
                          offset="25%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.35"
                        />
                        <stop
                          offset="30%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.28"
                        />
                        <stop
                          offset="35%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.2"
                        />
                        <stop
                          offset="40%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.14"
                        />
                        <stop
                          offset="50%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.08"
                        />
                        <stop
                          offset="60%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.04"
                        />
                        <stop
                          offset="70%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.02"
                        />
                        <stop
                          offset="80%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.005"
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0"
                        />
                      </radialGradient>
                      {/* Linear gradient for horizontal line - fades at edges */}
                      <linearGradient
                        id={lineGradientId}
                        x1={cx - width}
                        y1={cy}
                        x2={cx + width}
                        y2={cy}
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop
                          offset="0%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0"
                        />
                        <stop
                          offset="40%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.8"
                        />
                        <stop
                          offset="60%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0.8"
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(var(--ethena))"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    {/* Semicircle gradient ray - direction based on taker's prediction */}
                    <path
                      d={
                        rayUp
                          ? `M ${cx - width} ${cy} A ${width} ${rayLength} 0 0 1 ${cx + width} ${cy} Z`
                          : `M ${cx - width} ${cy} A ${width} ${rayLength} 0 0 0 ${cx + width} ${cy} Z`
                      }
                      fill={`url(#${gradientId})`}
                      className="bracket-ray"
                    />
                    {/* Horizontal line as rect with gradient fill */}
                    <rect
                      x={cx - width}
                      y={cy - 0.5}
                      width={width * 2}
                      height={1}
                      fill={`url(#${lineGradientId})`}
                      className="scatter-dot"
                    />
                  </g>
                );
              }

              // Regular circle for non-combined predictions
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="hsl(var(--ethena) / 0.2)"
                  stroke="hsl(var(--ethena) / 0.8)"
                  strokeWidth={1.5}
                  className="scatter-dot"
                  onMouseEnter={() => {
                    if (tooltipTimeoutRef.current) {
                      clearTimeout(tooltipTimeoutRef.current);
                      tooltipTimeoutRef.current = null;
                    }
                    setHoveredPoint(payload as PredictionData);
                  }}
                  onMouseLeave={() => {
                    // Delay clearing to allow moving to tooltip
                    tooltipTimeoutRef.current = setTimeout(() => {
                      if (!isTooltipHoveredRef.current) {
                        setHoveredPoint(null);
                      }
                    }, 150);
                  }}
                />
              );
            }}
          />
          {/* Comment squares - rendered on top of prediction dots */}
          <Scatter
            name="Comments"
            data={commentScatterData}
            fill="hsl(var(--brand-white))"
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const size = 6;
              const isHovered =
                hoveredComment?.data?.x === payload?.x &&
                hoveredComment?.data?.attester === payload?.attester;
              return (
                <rect
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                  fill={
                    isHovered
                      ? 'hsl(var(--brand-white))'
                      : 'hsl(var(--brand-white) / 0.9)'
                  }
                  stroke="hsl(var(--brand-white))"
                  strokeWidth={1}
                  className="cursor-pointer"
                  style={{
                    filter: isHovered
                      ? 'drop-shadow(0 0 4px hsl(var(--brand-white) / 0.5))'
                      : undefined,
                  }}
                  onMouseEnter={() => {
                    cancelCommentTooltipHide();
                    if (typeof cx === 'number' && typeof cy === 'number') {
                      setHoveredComment({
                        x: cx,
                        y: cy,
                        data: payload as PredictionData,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    scheduleCommentTooltipHide(150);
                  }}
                />
              );
            }}
          />
          {/* Forecast dots - white dots for user-submitted forecasts */}
          <Scatter
            name="Forecasts"
            data={forecastScatterData}
            fill="hsl(var(--brand-white))"
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const radius = 2;
              const isHovered =
                hoveredForecast?.x === payload?.x &&
                hoveredForecast?.attester === payload?.attester;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="hsl(var(--brand-white))"
                  opacity={isHovered ? 0.8 : 0.6}
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    if (tooltipTimeoutRef.current) {
                      clearTimeout(tooltipTimeoutRef.current);
                      tooltipTimeoutRef.current = null;
                    }
                    setHoveredForecast(payload as ForecastData);
                  }}
                  onMouseLeave={() => {
                    // Delay clearing to allow moving to tooltip
                    tooltipTimeoutRef.current = setTimeout(() => {
                      if (!isTooltipHoveredRef.current) {
                        setHoveredForecast(null);
                      }
                    }, 150);
                  }}
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Comment popover - positioned absolutely relative to scatter plot container */}
      <AnimatePresence>
        {hoveredComment && (
          <motion.div
            key={`comment-${hoveredComment.data.x}-${hoveredComment.data.attester}`}
            className="absolute pointer-events-auto z-50"
            style={{
              left: hoveredComment.x,
              top: hoveredComment.y,
              transform: 'translate(8px, 8px)',
            }}
            onMouseEnter={() => {
              isCommentTooltipHoveredRef.current = true;
              cancelCommentTooltipHide();
            }}
            onMouseLeave={() => {
              isCommentTooltipHoveredRef.current = false;
              scheduleCommentTooltipHide(100);
            }}
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div
              className="rounded-lg border overflow-hidden max-w-[320px] min-w-[280px]"
              style={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              {/* Comment content */}
              {hoveredComment.data.comment && (
                <div className="p-3 border-b border-border">
                  <div className="text-sm leading-relaxed text-foreground/90 break-words">
                    {hoveredComment.data.comment}
                  </div>
                </div>
              )}

              {/* Meta row: prediction badge, time, address */}
              <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                {/* Prediction badge */}
                {hoveredComment.data.predictionPercent !== undefined && (
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
                      hoveredComment.data.predictionPercent > 50
                        ? 'border-yes/40 bg-yes/10 text-yes'
                        : hoveredComment.data.predictionPercent < 50
                          ? 'border-no/40 bg-no/10 text-no'
                          : 'border-muted-foreground/40 bg-muted/10 text-muted-foreground'
                    }`}
                  >
                    {hoveredComment.data.predictionPercent}% chance
                  </Badge>
                )}

                {/* Time */}
                <span className="text-xs text-muted-foreground font-mono">
                  {formatDistanceToNow(new Date(hoveredComment.data.x), {
                    addSuffix: true,
                  })}
                </span>

                {/* Author */}
                {hoveredComment.data.attester && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <EnsAvatar
                      address={hoveredComment.data.attester}
                      className="w-4 h-4 rounded-sm"
                      width={16}
                      height={16}
                    />
                    <AddressDisplay
                      address={hoveredComment.data.attester}
                      compact
                      disablePopover
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// CSS styles for the scatter chart - should be added to the parent component's styles
export const scatterChartStyles = `
  .scatter-dot {
    transition: fill 150ms ease-out;
    cursor: pointer;
  }
  .scatter-dot:hover {
    animation: scatter-pulse 2.5s ease-in-out infinite;
  }
  @keyframes scatter-pulse {
    0%,
    100% {
      fill: hsl(var(--ethena) / 0.2);
    }
    50% {
      fill: hsl(var(--ethena) / 0.45);
    }
  }
  .bracket-combined {
    cursor: pointer;
  }
  .bracket-ray {
    opacity: 0.5;
    transition: opacity 150ms ease-out;
  }
  .bracket-combined:hover .bracket-ray {
    animation: ray-pulse 2.5s ease-in-out infinite;
  }
  @keyframes ray-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.85;
    }
  }
  .scatter-tooltip {
    animation: tooltip-fade-in 150ms ease-out;
  }
  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;
