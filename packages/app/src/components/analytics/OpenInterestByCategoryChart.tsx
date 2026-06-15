'use client';

import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { useProtocolAnalytics } from '~/hooks/graphql/useAnalytics';
import {
  collapsePriceCategories,
  getCategoryColor,
} from '~/components/markets/market-helpers';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import Loader from '~/components/shared/Loader';

interface SliceDatum {
  name: string;
  slug: string;
  color: string;
  /** OI as a Number (already divided by 1e18). */
  value: number;
  /** % of total, 0–100. */
  percent: number;
}

export default function OpenInterestByCategoryChart() {
  const { data: analytics, isLoading } = useProtocolAnalytics();
  // v2 categories are slug-keyed (no numeric row id) — the chart already
  // keys slices on `slug`, so the shape change is invisible here.
  const data = analytics?.openInterestByCategory;

  const slices = useMemo<SliceDatum[]>(() => {
    if (!data || data.length === 0) return [];
    const merged = collapsePriceCategories(
      data.map((d) => ({
        slug: d.category.slug,
        name: d.category.name,
        raw: BigInt(d.openInterest || '0'),
      }))
    );
    merged.sort((a, b) => (a.raw < b.raw ? 1 : a.raw > b.raw ? -1 : 0));

    const total = merged.reduce((acc, s) => acc + s.raw, 0n);
    const totalNum = Number(total) / 1e18;
    // Drop slices that would render as "0.0%" — the legend uses toFixed(1),
    // so anything under 0.05% is rounded down and looks like a no-op row.
    return merged
      .map((s) => {
        const value = Number(s.raw) / 1e18;
        return {
          name: s.name,
          slug: s.slug,
          color: getCategoryColor(s.slug),
          value,
          percent: totalNum > 0 ? (value / totalNum) * 100 : 0,
        };
      })
      .filter((s) => s.percent >= 0.05);
  }, [data]);

  return (
    <Card className="bg-brand-black border border-brand-white/10 h-full">
      <CardContent className="p-6 h-full flex flex-col">
        <h3 className="sc-heading text-foreground mb-4">
          Open Interest by Category
        </h3>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader className="w-8 h-8" />
          </div>
        ) : slices.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            No open interest yet.
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,220px)] gap-6 items-stretch">
            <div className="min-h-[260px] mx-auto w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="95%"
                    paddingAngle={0.5}
                    minAngle={3}
                    stroke="hsl(var(--brand-black))"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    activeIndex={-1}
                  >
                    {slices.map((s) => (
                      <Cell key={s.slug} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="divide-y divide-border/40 text-sm flex flex-col justify-center py-1">
              {slices.map((s) => {
                const Icon = getCategoryIcon(s.slug);
                return (
                  <li
                    key={s.slug}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${s.color} 18%, transparent)`,
                        }}
                      >
                        <Icon className="h-3 w-3" style={{ color: s.color }} />
                      </span>
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {s.percent.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
