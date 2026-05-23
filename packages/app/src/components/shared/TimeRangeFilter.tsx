'use client';

import { Calendar } from '@sapience/ui/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Tabs, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import { cn } from '@sapience/ui/lib/utils';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

type DateRange = { from: Date | undefined; to?: Date };

import { presetRange, type FixedPreset, type TimeRange } from './timeRange';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

export * from './timeRange';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

export default function TimeRangeFilter({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>();
  const isCustom = value.preset === 'CUSTOM';

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPending(value.from ? { from: value.from, to: value.to } : undefined);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tabs
        value={isCustom ? '' : value.preset}
        onValueChange={(v) => {
          if (v) onChange(presetRange(v as FixedPreset));
        }}
        className={className}
      >
        <SegmentedTabsList triggerClassName="text-xs px-2 h-7">
          <TabsTrigger value="1W">1W</TabsTrigger>
          <TabsTrigger value="1M">1M</TabsTrigger>
          <TabsTrigger value="3M">3M</TabsTrigger>
          <TabsTrigger value="ALL">ALL</TabsTrigger>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Custom date range"
              title="Custom range"
              className={cn(
                'inline-flex items-center justify-center transition-colors',
                isCustom
                  ? 'bg-[var(--seg-active)] text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CalendarDays className="w-3 h-3" />
            </button>
          </PopoverTrigger>
        </SegmentedTabsList>
      </Tabs>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={value.from ?? new Date(Date.now() - 30 * DAY_MS)}
          selected={pending}
          onSelect={(r) => {
            // react-day-picker's range mode returns {from: date, to: date}
            // on the first click (same date on both ends). Only commit and
            // close once the user picks a real second endpoint.
            setPending(r);
            if (r?.from && r.to && r.from.getTime() !== r.to.getTime()) {
              onChange({ preset: 'CUSTOM', from: r.from, to: r.to });
              setOpen(false);
            }
          }}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}
