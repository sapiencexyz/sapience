'use client';

import { Tabs, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

export type Period = '1W' | '1M' | '3M' | 'ALL';

export const PERIOD_DAYS: Record<Period, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  ALL: Infinity,
};

interface PeriodFilterProps {
  value: Period;
  onChange: (period: Period) => void;
  className?: string;
}

export default function PeriodFilter({
  value,
  onChange,
  className,
}: PeriodFilterProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as Period)}
      className={className}
    >
      <SegmentedTabsList triggerClassName="text-xs px-2 h-7">
        <TabsTrigger value="1W">1W</TabsTrigger>
        <TabsTrigger value="1M">1M</TabsTrigger>
        <TabsTrigger value="3M">3M</TabsTrigger>
        <TabsTrigger value="ALL">ALL</TabsTrigger>
      </SegmentedTabsList>
    </Tabs>
  );
}
