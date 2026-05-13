'use client';

import { Card, CardContent } from '@sapience/ui/components/ui/card';
import { Tabs, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import { useState } from 'react';

import type { AccountStatMetric } from '@sapience/sdk/queries';

import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import Loader from '~/components/shared/Loader';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import TimeRangeFilter, {
  presetRange,
  type TimeRange,
} from '~/components/shared/TimeRangeFilter';
import {
  useAccountStatsLeaderboard,
  type AccountStatEntry,
} from '~/hooks/graphql/useAccountStatsLeaderboard';

const METRICS: { value: AccountStatMetric; label: string }[] = [
  { value: 'NET_PNL', label: 'Net PnL' },
  { value: 'GAINS', label: 'Gains' },
  { value: 'LOSSES', label: 'Losses' },
  { value: 'VOLUME', label: 'Volume' },
];

const ROW_COUNT = 10;

function metricValue(
  entry: AccountStatEntry,
  metric: AccountStatMetric
): string {
  switch (metric) {
    case 'GAINS':
      return entry.gains;
    case 'LOSSES':
      return entry.losses;
    case 'VOLUME':
      return entry.volume;
    case 'NET_PNL':
    default:
      return entry.netPnL;
  }
}

function formatUsde(wei: string): string {
  const value = parseFloat(wei) / 1e18;
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDe`;
}

export default function AccountsLeaderboardCard() {
  const [range, setRange] = useState<TimeRange>(presetRange('1M'));
  const [metric, setMetric] = useState<AccountStatMetric>('NET_PNL');
  const { data, isLoading } = useAccountStatsLeaderboard(
    metric,
    range,
    ROW_COUNT
  );

  const rows = data ?? [];

  return (
    <Card className="bg-brand-black border border-brand-white/10">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="sc-heading text-foreground flex items-center gap-1.5">
            Top Accounts
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={metric}
              onValueChange={(v) => setMetric(v as AccountStatMetric)}
            >
              <SegmentedTabsList triggerClassName="text-xs px-2 h-7">
                {METRICS.map((m) => (
                  <TabsTrigger key={m.value} value={m.value}>
                    {m.label}
                  </TabsTrigger>
                ))}
              </SegmentedTabsList>
            </Tabs>
            <TimeRangeFilter value={range} onChange={setRange} />
          </div>
        </div>

        {/*
         * Reserve the row area so it doesn't pop in height when switching
         * between loader, empty state, and full list. Roughly: 10 rows ×
         * (avatar 22 + py-2.5 = 42px) + 9 dividers ≈ 429px.
         */}
        <div className="min-h-[430px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-[430px]">
              <Loader className="w-8 h-8" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-[430px] text-muted-foreground">
              No data available
            </div>
          ) : (
            <ul className="divide-y divide-brand-white/10">
              {rows.map((entry, index) => (
                <li
                  key={entry.address}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <EnsAvatar address={entry.address} width={22} height={22} />
                    <AddressDisplay address={entry.address} />
                  </div>
                  <span className="font-mono text-sm text-brand-white whitespace-nowrap">
                    {formatUsde(metricValue(entry, metric))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
