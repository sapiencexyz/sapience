'use client';

import type * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';
import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import { RangeFilter } from '~/components/shared/RangeFilter';
import {
  StatusFilter,
  type StatusOption,
} from '~/components/shared/StatusFilter';

export interface TableFilterState<TStatus extends string> {
  searchTerm: string;
  status: TStatus[];
  valueRange: [number, number];
  dateRange: [number, number];
}

export interface TableFiltersConfig<TStatus extends string> {
  searchPlaceholder?: string;
  statusOptions: StatusOption<TStatus>[];
  statusPlaceholder?: string;
  statusAllLabel?: string;
  valueRange: {
    placeholder: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    formatValue: (v: number) => string;
    parseValue: (v: string) => number;
  };
  dateRange: {
    placeholder: string;
    min?: number;
    max?: number;
    customLabels?: { range: [number, number]; label: string }[];
  };
}

const DEFAULT_DATE_MIN = -365;
const DEFAULT_DATE_MAX = 365;

export function TableFilters<TStatus extends string>({
  filters,
  onFiltersChange,
  config,
  className,
}: {
  filters: TableFilterState<TStatus>;
  onFiltersChange: (filters: TableFilterState<TStatus>) => void;
  config: TableFiltersConfig<TStatus>;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const dateMin = config.dateRange.min ?? DEFAULT_DATE_MIN;
  const dateMax = config.dateRange.max ?? DEFAULT_DATE_MAX;

  const valueSliderValue: [number, number] = [
    filters.valueRange[0],
    filters.valueRange[1] === Infinity
      ? config.valueRange.max
      : Math.min(filters.valueRange[1], config.valueRange.max),
  ];

  const handleValueChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      valueRange: [
        value[0],
        value[1] >= config.valueRange.max ? Infinity : value[1],
      ],
    });
  };

  const dateSliderValue: [number, number] = [
    filters.dateRange[0] === -Infinity
      ? dateMin
      : Math.max(filters.dateRange[0], dateMin),
    filters.dateRange[1] === Infinity
      ? dateMax
      : Math.min(filters.dateRange[1], dateMax),
  ];

  const handleDateRangeChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      dateRange: [
        value[0] <= dateMin ? -Infinity : value[0],
        value[1] >= dateMax ? Infinity : value[1],
      ],
    });
  };

  const handleStatusChange = (status: TStatus[]) => {
    onFiltersChange({ ...filters, status });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, searchTerm: e.target.value });
  };

  return (
    <div
      className={cn(
        'grid gap-2 md:gap-4 grid-cols-2 md:grid-cols-4',
        className
      )}
    >
      <div className="relative flex items-center">
        <Search className="hidden md:block absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none z-10" />
        <input
          type="text"
          placeholder={
            isMobile
              ? 'Search'
              : (config.searchPlaceholder ?? 'Search predictions')
          }
          value={filters.searchTerm}
          onChange={handleSearchInputChange}
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left pl-3 md:pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>
      <StatusFilter
        options={config.statusOptions}
        selected={filters.status}
        onChange={handleStatusChange}
        placeholder={config.statusPlaceholder ?? 'Any status'}
        allLabel={config.statusAllLabel ?? 'All statuses'}
      />
      <RangeFilter
        placeholder={config.valueRange.placeholder}
        value={valueSliderValue}
        onChange={handleValueChange}
        min={config.valueRange.min}
        max={config.valueRange.max}
        step={config.valueRange.step}
        formatValue={config.valueRange.formatValue}
        parseValue={config.valueRange.parseValue}
        unit={config.valueRange.unit}
      />
      <RangeFilter
        placeholder={config.dateRange.placeholder}
        value={dateSliderValue}
        onChange={handleDateRangeChange}
        min={dateMin}
        max={dateMax}
        step={1}
        formatValue={(v) => {
          if (v >= dateMax) return '∞';
          if (v <= dateMin) return '-∞';
          return String(v);
        }}
        parseValue={(v) => {
          if (v === '∞') return dateMax;
          if (v === '-∞') return dateMin;
          return Number(v);
        }}
        unit="days"
        showSign
        customLabels={config.dateRange.customLabels}
      />
    </div>
  );
}

export function getDefaultFilterState<
  TStatus extends string,
>(): TableFilterState<TStatus> {
  return {
    searchTerm: '',
    status: [],
    valueRange: [0, Infinity],
    dateRange: [-Infinity, Infinity],
  };
}
