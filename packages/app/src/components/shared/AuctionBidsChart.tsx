'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/sdk/ui/components/ui/hover-card';
import { formatEther } from 'viem';
import TradePopoverContent from '~/components/shared/TradePopoverContent';
import ExpiresInLabel from '~/components/shared/ExpiresInLabel';

export type AuctionBidData = {
  auctionId: string;
  maker: string;
  makerWager: string;
  makerDeadline: number;
  makerSignature: string;
  makerNonce: number;
  receivedAtMs?: number;
};

type Props = {
  bids: AuctionBidData[];
  // Optional refresh interval in milliseconds to sync animation duration
  refreshMs?: number;
  // When true, use requestAnimationFrame to continuously update time window
  continuous?: boolean;
  takerWager?: string | null;
  taker?: string | null;
  collateralAssetTicker: string;
  // Whether to show hover tooltips (default true)
  showTooltips?: boolean;
  // Optional compact mode for smaller containers
  compact?: boolean;
};

const AuctionBidsChart: React.FC<Props> = ({
  bids,
  refreshMs = 1000,
  continuous = false,
  takerWager,
  taker,
  collateralAssetTicker,
  showTooltips = true,
  compact = false,
}) => {
  const [nowMs, setNowMs] = useState<number>(Date.now());
  // Track hovered bid with container-relative coordinates
  const [hoveredBid, setHoveredBid] = useState<{
    x: number; // container-relative X
    y: number; // container-relative Y
    seriesKey: string; // key of the hovered series for highlighting
    data: {
      amount: number;
      makerAddress: string;
      endMs: number;
    };
  } | null>(null);
  // Track if mouse is over the popover content (for sticky behavior)
  const [isOverPopover, setIsOverPopover] = useState(false);
  // Preserve last displayed data to prevent empty popover during transitions
  const lastDisplayedBidRef = useRef<typeof hoveredBid>(null);
  if (hoveredBid) {
    lastDisplayedBidRef.current = hoveredBid;
  }
  const chartRef = useRef<HTMLDivElement>(null);
  const takerEth = (() => {
    try {
      return Number(formatEther(BigInt(String(takerWager ?? '0'))));
    } catch {
      return 0;
    }
  })();

  useEffect(() => {
    if (continuous) {
      let rafId: number;
      let mounted = true;
      const tick = () => {
        if (!mounted) return;
        setNowMs(Date.now());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => {
        mounted = false;
        cancelAnimationFrame(rafId);
      };
    } else {
      const id = setInterval(
        () => setNowMs(Date.now()),
        Math.max(16, refreshMs)
      );
      return () => clearInterval(id);
    }
  }, [continuous, refreshMs]);

  const series = useMemo(
    () =>
      bids
        .map((b) => {
          let amount = 0;
          try {
            amount = Number(formatEther(BigInt(String(b?.makerWager ?? '0'))));
          } catch {
            amount = 0;
          }
          // Use receivedAtMs if available, otherwise estimate from deadline
          const start = Number(b?.receivedAtMs || nowMs - 30000);
          const end = Number(b?.makerDeadline || 0) * 1000;
          if (
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            end <= 0
          ) {
            return null as null | {
              key: string;
              start: number;
              end: number;
              data: {
                time: number;
                amount: number;
                makerAddress?: string;
                takerAmountEth?: number;
                endMs?: number;
              }[];
            };
          }
          const key = `${String((b as any)?.id ?? (b as any)?.takerTxHash ?? start)}-${end}`;
          return {
            key,
            start,
            end,
            data: [
              {
                time: start,
                amount,
                makerAddress: b.maker || '',
                takerAmountEth: amount,
                endMs: end,
              },
              {
                time: end,
                amount,
                makerAddress: b.maker || '',
                takerAmountEth: amount,
                endMs: end,
              },
            ],
          };
        })
        .filter(Boolean) as {
        key: string;
        start: number;
        end: number;
        simulationStatus?: 'pending' | 'success' | 'failed';
        data: {
          time: number;
          amount: number;
          makerAddress?: string;
          takerAmountEth?: number;
          endMs?: number;
        }[];
      }[],
    [bids, nowMs]
  );

  // Parent chart still requires a data array; each series overrides with its own data.
  const data = useMemo<{ time: number; amount: number }[]>(() => [], []);

  const xDomain = useMemo<[number, number]>(() => {
    const center = nowMs;
    const start = center - 60_000; // -1 minute
    const end = center + 60_000; // +1 minute
    return [start, end];
  }, [nowMs]);

  const xTicks = useMemo<number[]>(() => {
    const center = nowMs;
    return [center - 60_000, center, center + 60_000];
  }, [nowMs]);

  const seriesColor = useMemo(() => 'hsl(var(--ethena))', []);

  // Calculate Y domain for mapping mouse Y to amount
  const yDomain = useMemo<[number, number]>(() => {
    if (series.length === 0) return [0, 1];
    const maxAmount = Math.max(...series.map((s) => s.data[0].amount));
    return [0, maxAmount > 0 ? maxAmount * 1.1 : 1];
  }, [series]);

  // Find the closest bid to the mouse position (both X time and Y amount)
  // Returns both the bid data and the series key for highlighting
  const findClosestBid = useCallback(
    (
      timeMs: number,
      mouseAmount: number
    ): { data: (typeof series)[0]['data'][0]; key: string } | null => {
      // Filter to bids active at this time
      const activeBids = series.filter(
        (s) => timeMs >= s.start && timeMs <= s.end
      );
      if (activeBids.length === 0) return null;

      // Find the bid closest to the mouse Y position (amount)
      let closest = activeBids[0];
      let closestDistance = Math.abs(closest.data[0].amount - mouseAmount);

      for (const bid of activeBids) {
        const distance = Math.abs(bid.data[0].amount - mouseAmount);
        if (distance < closestDistance) {
          closest = bid;
          closestDistance = distance;
        }
      }

      return { data: closest.data[0], key: closest.key };
    },
    [series]
  );

  // Handle mouse move to show custom tooltip (throttled for performance)
  const lastMoveRef = useRef<number>(0);
  const yAxisWidth = compact ? 44 : 56;
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!showTooltips) return;
      // Throttle to ~60fps
      const now = performance.now();
      if (now - lastMoveRef.current < 16) return;
      lastMoveRef.current = now;

      const container = chartRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Chart area starts after Y axis and has padding (16px right, 0 left)
      const chartLeft = yAxisWidth;
      const chartRight = rect.width - 16;
      const chartWidth = chartRight - chartLeft;
      const chartTop = 16;
      const chartBottom = rect.height - 20; // Account for X axis
      const chartHeight = chartBottom - chartTop;

      // Only show tooltip when hovering in the chart area
      if (
        mouseX < chartLeft ||
        mouseX > chartRight ||
        mouseY < chartTop ||
        mouseY > chartBottom
      ) {
        setHoveredBid(null);
        return;
      }

      // Map mouse X to time
      const relativeX = (mouseX - chartLeft) / chartWidth;
      const timeRange = xDomain[1] - xDomain[0];
      const timeMs = xDomain[0] + relativeX * timeRange;

      // Map mouse Y to amount (Y axis is inverted: top = high, bottom = low)
      const relativeY = (mouseY - chartTop) / chartHeight;
      const amountRange = yDomain[1] - yDomain[0];
      const mouseAmount = yDomain[1] - relativeY * amountRange; // Invert Y

      const result = findClosestBid(timeMs, mouseAmount);
      if (result) {
        setHoveredBid({
          // Store container-relative coordinates for absolute positioning
          x: mouseX,
          y: mouseY,
          seriesKey: result.key,
          data: {
            amount: result.data.amount,
            makerAddress: result.data.makerAddress || '',
            endMs: result.data.endMs || 0,
          },
        });
      } else {
        setHoveredBid(null);
      }
    },
    [xDomain, yDomain, findClosestBid, showTooltips, yAxisWidth]
  );

  const handleMouseLeave = useCallback(() => {
    // Don't close if mouse moved to the popover
    if (!isOverPopover) {
      setHoveredBid(null);
    }
  }, [isOverPopover]);

  // Handle popover mouse enter/leave for sticky behavior
  const handlePopoverMouseEnter = useCallback(() => {
    setIsOverPopover(true);
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    setIsOverPopover(false);
    setHoveredBid(null);
  }, []);

  // Use current or last displayed bid for popover content
  const displayBidData =
    hoveredBid || (isOverPopover ? lastDisplayedBidRef.current : null);

  // Determine if HoverCard should be open (only when we have data to show)
  const isHoverCardOpen = Boolean(displayBidData) && showTooltips;

  return (
    <div
      ref={chartRef}
      className="h-full w-full relative cursor-crosshair rounded-md bg-background border border-border pt-3 pb-3 pr-3 pl-1"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={seriesColor} stopOpacity={0.5} />
              <stop offset="95%" stopColor={seriesColor} stopOpacity={0.03} />
            </linearGradient>
            {/* Highlighted gradient for hovered bid - subtle increase */}
            <linearGradient id="colorBidHovered" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={seriesColor} stopOpacity={0.7} />
              <stop offset="95%" stopColor={seriesColor} stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(128,128,128,0.15)"
            strokeDasharray="1 3"
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={xDomain}
            ticks={xTicks}
            interval={0}
            allowDataOverflow
            allowDecimals={false}
            height={20}
            tickMargin={6}
            tick={(props: any) => {
              const { x, y, payload } = props as {
                x: number;
                y: number;
                payload: { value: number };
              };
              const v = payload?.value;
              let label = '';
              let textAnchor: 'start' | 'middle' | 'end' = 'middle';
              let dx = 0;
              if (v === xTicks[0]) {
                label = '-1 min';
                textAnchor = 'start';
                dx = 4;
              } else if (v === xTicks[1]) {
                label = 'NOW';
                textAnchor = 'middle';
                dx = 0;
              } else if (v === xTicks[2]) {
                label = '+1 min';
                textAnchor = 'end';
                dx = -4;
              }
              if (!label) return <g />;
              return (
                <text
                  x={x}
                  y={y}
                  dx={dx}
                  dy={6}
                  textAnchor={textAnchor}
                  fontSize={compact ? 9 : 10}
                  fontFamily={
                    'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
                  }
                  fill={'hsl(var(--brand-white))'}
                >
                  {label}
                </text>
              );
            }}
          />
          <YAxis
            dataKey="amount"
            tick={{
              fontSize: compact ? 9 : 10,
              fill: 'hsl(var(--muted-foreground))',
            }}
            width={yAxisWidth}
            domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.1 : 1)]}
            tickFormatter={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return '';
              return n.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }}
          />
          {series.map((s) => {
            const isNew =
              nowMs - s.start < Math.max(300, Math.min(1200, refreshMs * 2));
            const isHovered = displayBidData?.seriesKey === s.key;
            return (
              <Area
                key={s.key}
                type="stepAfter"
                data={s.data}
                dataKey="amount"
                stroke={seriesColor}
                strokeWidth={isHovered ? 2 : 1.5}
                fillOpacity={isHovered ? 0.3 : 0.2}
                fill={isHovered ? 'url(#colorBidHovered)' : 'url(#colorBid)'}
                isAnimationActive={isNew}
                animationBegin={0}
                animationDuration={isNew ? 500 : 0}
                animationEasing="ease-out"
                dot={false}
                activeDot={false}
                className="bid-area-path"
              />
            );
          })}
          {/* Dotted vertical line at current time (center "NOW") */}
          <ReferenceLine
            x={nowMs}
            stroke={'hsl(var(--brand-white))'}
            strokeDasharray="1 3"
            strokeWidth={1}
            className="now-ref-line"
            isFront
            ifOverflow="hidden"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Sticky HoverCard tooltip */}
      {showTooltips && (
        <HoverCard open={isHoverCardOpen} openDelay={0} closeDelay={100}>
          <HoverCardTrigger asChild>
            <div
              className="absolute w-0 h-0"
              style={{
                left: displayBidData?.x ?? 0,
                top: displayBidData?.y ?? 0,
              }}
            />
          </HoverCardTrigger>
          <HoverCardContent
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="w-auto p-0"
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
          >
            {displayBidData && (
              <div className="px-3 py-2.5">
                <TradePopoverContent
                  leftAddress={displayBidData.data.makerAddress}
                  rightAddress={String(taker || '')}
                  takerAmountEth={displayBidData.data.amount}
                  totalAmountEth={
                    displayBidData.data.amount +
                    (Number.isFinite(takerEth) ? takerEth : 0)
                  }
                  percent={
                    displayBidData.data.amount + takerEth > 0
                      ? Math.round(
                          (displayBidData.data.amount /
                            (displayBidData.data.amount + takerEth)) *
                            100
                        )
                      : undefined
                  }
                  ticker={collateralAssetTicker}
                  timeNode={
                    displayBidData.data.endMs > 0 ? (
                      <ExpiresInLabel
                        endMs={displayBidData.data.endMs}
                        nowMs={nowMs}
                      />
                    ) : undefined
                  }
                />
              </div>
            )}
          </HoverCardContent>
        </HoverCard>
      )}

      <style jsx>{`
        :global(.now-ref-line .recharts-reference-line-line) {
          stroke-dasharray: 1 3;
          animation: nowLineDash 1.4s linear infinite;
        }
        @keyframes nowLineDash {
          to {
            stroke-dashoffset: 8;
          }
        }
        /* Smooth transition for bid area hover effects */
        :global(.bid-area-path) {
          transition:
            fill-opacity 200ms ease-out,
            stroke-width 200ms ease-out;
        }
      `}</style>
    </div>
  );
};

export default AuctionBidsChart;
