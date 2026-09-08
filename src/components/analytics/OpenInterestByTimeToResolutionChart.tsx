'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent } from '~/components/ui/card';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';
import { useProtocolAnalytics } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';

const DAY_SECONDS = 86400;
const MONTH_SECONDS = 30 * DAY_SECONDS;

/**
 * Derives a display label from a bucket's explicit bounds. The window is
 * `(minSecondsFromNow, maxSecondsFromNow]` — left-EXCLUSIVE,
 * right-INCLUSIVE (server bug #13 fixed the orientation; do not re-derive
 * with `[min, max)`). For the current server buckets
 * (1d / 7d / 30d / 60d / 90d / 180d / beyond) this reproduces the original
 * labels exactly: "≤1 day", "2-7 days", "8-30 days", "1-2 mo.",
 * "2-3 mo.", "3-6 mo.", "6 mo.+".
 */
export function formatBucketLabel(
  min: number | null,
  max: number | null
): string {
  if (max == null) {
    // Open-ended tail.
    if (min == null) return 'All';
    return min % MONTH_SECONDS === 0
      ? `${min / MONTH_SECONDS} mo.+`
      : `${Math.ceil(min / DAY_SECONDS)}+ days`;
  }
  if (min == null) {
    // First bucket — also absorbs overdue predictions.
    const days = Math.max(1, Math.round(max / DAY_SECONDS));
    return days === 1 ? '≤1 day' : `≤${days} days`;
  }
  if (max > MONTH_SECONDS) {
    const minMonths = Math.max(1, Math.round(min / MONTH_SECONDS));
    const maxMonths = Math.round(max / MONTH_SECONDS);
    return `${minMonths}-${maxMonths} mo.`;
  }
  // Exclusive lower bound: the bucket starts the day AFTER `min`.
  const lowerDay = Math.floor(min / DAY_SECONDS) + 1;
  const upperDay = Math.round(max / DAY_SECONDS);
  return `${lowerDay}-${upperDay} days`;
}

interface BarDatum {
  bucket: number;
  label: string;
  value: number;
  predictionCount: number;
}

function formatChartValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function ResolutionTooltip({
  active,
  payload,
  symbol,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum }>;
  symbol: string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  const formatted = datum.value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return (
    <div className="rounded-md border border-border/60 bg-background/95 backdrop-blur px-3 py-2 text-sm shadow-lg">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        Resolves in {datum.label}
      </div>
      <div className="font-mono text-base">
        {formatted} {symbol}
      </div>
      <div className="text-xs text-muted-foreground">
        {datum.predictionCount}{' '}
        {datum.predictionCount === 1 ? 'prediction' : 'predictions'}
      </div>
    </div>
  );
}

export default function OpenInterestByTimeToResolutionChart() {
  const { data: analytics, isLoading } = useProtocolAnalytics();
  const symbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] ?? 'USDe';

  const bars = useMemo<BarDatum[]>(() => {
    // Already sorted ascending by maxSecondsFromNow (tail last) by the SDK.
    const rows = analytics?.openInterestByTimeToResolution ?? [];
    return rows.map((row, index) => ({
      bucket: index + 1,
      label: formatBucketLabel(row.minSecondsFromNow, row.maxSecondsFromNow),
      value: Number(BigInt(row.openInterest || '0')) / 1e18,
      predictionCount: row.predictionCount,
    }));
  }, [analytics]);

  const hasData = bars.some((b) => b.value > 0);

  return (
    <Card className="bg-brand-black border border-brand-white/10">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          <h3 className="sc-heading text-foreground">
            Open Interest by Time to Resolution
          </h3>

          {isLoading ? (
            <div className="h-[260px] flex items-center justify-center">
              <Loader className="w-8 h-8" />
            </div>
          ) : !hasData ? (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
              No active open interest.
            </div>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bars}
                  margin={{ top: 10, right: 4, left: -4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--brand-white) / 0.1)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 11,
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    height={28}
                  />
                  <YAxis
                    tick={{
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 11,
                    }}
                    axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                    tickFormatter={formatChartValue}
                    width={44}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--brand-white) / 0.05)' }}
                    content={<ResolutionTooltip symbol={symbol} />}
                  />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--accent-gold) / 0.6)"
                    name="value"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
