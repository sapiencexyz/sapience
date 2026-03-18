import type React from 'react';

const MONTHS = [
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

export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return value.toFixed(1);
  }
  if (value <= -1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value <= -1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  if (value <= -1) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

export function formatTimestampTick(value: number): string {
  const date = new Date(value * 1000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

type AnimatedCursorProps = {
  top?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
};

export function AnimatedCursor({ points, top, height }: AnimatedCursorProps) {
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
      className="vault-chart-cursor"
    />
  );
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    value?: number | string | (number | string)[];
    dataKey?: string | number;
  }>;
  label?: number;
  collateralSymbol: string;
  dataKey: string;
};

export function ChartTooltip({
  active,
  payload,
  label,
  collateralSymbol,
  dataKey,
}: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;

  const dataPoint = payload.find((p) => p.dataKey === dataKey);
  if (!dataPoint || dataPoint.value == null) return null;

  const value = Number(dataPoint.value);
  const isPositive = value >= 0;
  const formattedValue = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let dateLabel = '';
  if (label != null) {
    const date = new Date(label * 1000);
    dateLabel = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
  }

  return (
    <div className="bg-background border border-border rounded-md px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {dateLabel}
      </div>
      <div
        className={`text-sm font-mono ${isPositive ? 'text-green-500' : 'text-red-500'}`}
      >
        {isPositive ? '+' : ''}
        {formattedValue} {collateralSymbol}
      </div>
    </div>
  );
}

export const CHART_AXIS_STYLE = {
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 11 },
  axisLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
  tickLine: { stroke: 'hsl(var(--brand-white) / 0.3)' },
};

export const CHART_MARGIN = { top: 10, right: 0, left: -15, bottom: 0 };

export const CURSOR_ANIMATION_STYLE = `
  :global(.vault-chart-cursor) {
    animation: cursorDash 1.4s linear infinite;
  }
  @keyframes cursorDash {
    to {
      stroke-dashoffset: 8;
    }
  }
`;
