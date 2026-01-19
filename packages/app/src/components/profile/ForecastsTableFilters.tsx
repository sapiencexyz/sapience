'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';
import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import { RangeFilter } from '~/components/shared/RangeFilter';
import {
  StatusFilter,
  type StatusOption,
} from '~/components/shared/StatusFilter';

export type ResolutionStatus = 'pending' | 'yes' | 'no';

export interface ForecastsFilterState {
  resolutionStatus: ResolutionStatus[];
  probabilityRange: [number, number]; // 0-100 percentage
  dateRange: [number, number]; // days from now, -Infinity to Infinity
  searchTerm: string; // search question/comment
}

interface ForecastsTableFiltersProps {
  filters: ForecastsFilterState;
  onFiltersChange: (filters: ForecastsFilterState) => void;
  className?: string;
}

const RESOLUTION_STATUS_OPTIONS: StatusOption<ResolutionStatus>[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

// Date range slider bounds
const DATE_SLIDER_MAX = 365;
const DATE_SLIDER_MIN = -365;

export function ForecastsTableFilters({
  filters,
  onFiltersChange,
  className,
}: ForecastsTableFiltersProps) {
  const isMobile = useIsMobile();

  const handleResolutionStatusChange = (status: ResolutionStatus[]) => {
    onFiltersChange({ ...filters, resolutionStatus: status });
  };

  const handleProbabilityChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      probabilityRange: value,
    });
  };

  // Map Infinity/-Infinity to slider bounds for date display
  const dateSliderValue: [number, number] = [
    filters.dateRange[0] === -Infinity
      ? DATE_SLIDER_MIN
      : Math.max(filters.dateRange[0], DATE_SLIDER_MIN),
    filters.dateRange[1] === Infinity
      ? DATE_SLIDER_MAX
      : Math.min(filters.dateRange[1], DATE_SLIDER_MAX),
  ];

  const handleDateRangeChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      dateRange: [
        value[0] <= DATE_SLIDER_MIN ? -Infinity : value[0],
        value[1] >= DATE_SLIDER_MAX ? Infinity : value[1],
      ],
    });
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
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="hidden md:block absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none z-10" />
        <input
          type="text"
          placeholder={isMobile ? 'Search' : 'Search question or comment'}
          value={filters.searchTerm}
          onChange={handleSearchInputChange}
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left pl-3 md:pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>
      <StatusFilter
        options={RESOLUTION_STATUS_OPTIONS}
        selected={filters.resolutionStatus}
        onChange={handleResolutionStatusChange}
        placeholder="Any resolution"
        allLabel="All resolutions"
      />
      <RangeFilter
        placeholder="Any probability"
        value={filters.probabilityRange}
        onChange={handleProbabilityChange}
        min={0}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        parseValue={(v) => Number(v)}
        unit="%"
      />
      <RangeFilter
        placeholder="Any date"
        value={dateSliderValue}
        onChange={handleDateRangeChange}
        min={DATE_SLIDER_MIN}
        max={DATE_SLIDER_MAX}
        step={1}
        formatValue={(v) => {
          if (v >= DATE_SLIDER_MAX) return '∞';
          if (v <= DATE_SLIDER_MIN) return '-∞';
          return String(v);
        }}
        parseValue={(v) => {
          if (v === '∞') return DATE_SLIDER_MAX;
          if (v === '-∞') return DATE_SLIDER_MIN;
          return Number(v);
        }}
        unit="days"
        showSign
        customLabels={[
          { range: [0, DATE_SLIDER_MAX], label: 'Last 365 days' },
          { range: [DATE_SLIDER_MIN, 0], label: 'Older forecasts' },
        ]}
      />
    </div>
  );
}

export const getDefaultForecastsFilterState = (): ForecastsFilterState => ({
  resolutionStatus: [],
  probabilityRange: [0, 100],
  dateRange: [-Infinity, Infinity],
  searchTerm: '',
});

export default ForecastsTableFilters;
