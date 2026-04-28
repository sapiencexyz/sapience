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
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useOpenInterestByTimeToResolution } from '~/hooks/graphql/useAnalytics';
import Loader from '~/components/shared/Loader';

const BUCKET_LABELS: Array<{ bucket: number; label: string }> = [
  { bucket: 1, label: '≤1 day' },
  { bucket: 2, label: '2-7 days' },
  { bucket: 3, label: '8-30 days' },
  { bucket: 4, label: '1-2 mo.' },
  { bucket: 5, label: '2-3 mo.' },
  { bucket: 6, label: '3-6 mo.' },
  { bucket: 7, label: '6 mo.+' },
];

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
  const { data, isLoading } = useOpenInterestByTimeToResolution();
  const symbol = COLLATERAL_SYMBOLS[DEFAULT_CHAIN_ID] ?? 'USDe';

  const bars = useMemo<BarDatum[]>(() => {
    const byBucket = new Map<number, { oi: bigint; count: number }>();
    for (const row of data ?? []) {
      byBucket.set(row.bucket, {
        oi: BigInt(row.openInterest || '0'),
        count: row.predictionCount,
      });
    }
    return BUCKET_LABELS.map(({ bucket, label }) => {
      const entry = byBucket.get(bucket);
      const value = entry ? Number(entry.oi) / 1e18 : 0;
      return {
        bucket,
        label,
        value,
        predictionCount: entry?.count ?? 0,
      };
    });
  }, [data]);

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
