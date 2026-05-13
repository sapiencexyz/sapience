'use client';

import { Calendar } from '@sapience/ui/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Tabs, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import { cn } from '@sapience/ui/lib/utils';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { presetRange, type FixedPreset, type TimeRange } from './timeRange';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

export * from './timeRange';

const DAY_MS = 24 * 60 * 60 * 1000;

function customLabel(range: TimeRange): string {
  if (range.preset !== 'CUSTOM' || !range.from) return 'Custom';
  const to = range.to ?? new Date();
  return `${format(range.from, 'MMM d')} – ${format(to, 'MMM d')}`;
}

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

export default function TimeRangeFilter({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const isCustom = value.preset === 'CUSTOM';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Tabs
        value={isCustom ? '' : value.preset}
        onValueChange={(v) => {
          if (v) onChange(presetRange(v as FixedPreset));
        }}
      >
        <SegmentedTabsList triggerClassName="text-xs px-2 h-7">
          <TabsTrigger value="1W">1W</TabsTrigger>
          <TabsTrigger value="1M">1M</TabsTrigger>
          <TabsTrigger value="3M">3M</TabsTrigger>
          <TabsTrigger value="ALL">ALL</TabsTrigger>
        </SegmentedTabsList>
      </Tabs>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 h-7 text-xs transition-colors',
              isCustom
                ? 'border-brand-white/30 text-foreground'
                : 'border-brand-white/10 text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarDays className="w-3 h-3" />
            {customLabel(value)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={value.from ?? new Date(Date.now() - 30 * DAY_MS)}
            selected={{ from: value.from, to: value.to }}
            onSelect={(r) => {
              // Only commit once both ends are picked, so a click-then-click
              // selection fires a single state change (and a single network
              // request downstream) instead of two.
              if (r?.from && r.to) {
                onChange({ preset: 'CUSTOM', from: r.from, to: r.to });
                setOpen(false);
              }
            }}
            disabled={{ after: new Date() }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
