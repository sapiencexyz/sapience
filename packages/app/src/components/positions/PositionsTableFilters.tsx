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

export type PositionStatus = 'active' | 'won' | 'lost';

export interface PositionsFilterState {
  status: PositionStatus[];
  wagerRange: [number, number]; // in USDe, 0 to Infinity
  dateRange: [number, number]; // days from now, -Infinity to Infinity
  searchTerm: string; // search prediction questions
}

interface PositionsTableFiltersProps {
  filters: PositionsFilterState;
  onFiltersChange: (filters: PositionsFilterState) => void;
  className?: string;
}

const STATUS_OPTIONS: StatusOption<PositionStatus>[] = [
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

// Map slider bounds to Infinity for range filters
const WAGER_SLIDER_MAX = 10000;
const DATE_SLIDER_MAX = 365;
const DATE_SLIDER_MIN = -365;

export function PositionsTableFilters({
  filters,
  onFiltersChange,
  className,
}: PositionsTableFiltersProps) {
  const isMobile = useIsMobile();

  // Map Infinity to slider max for wager display
  const wagerSliderValue: [number, number] = [
    filters.wagerRange[0],
    filters.wagerRange[1] === Infinity
      ? WAGER_SLIDER_MAX
      : Math.min(filters.wagerRange[1], WAGER_SLIDER_MAX),
  ];

  const handleWagerChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      wagerRange: [
        value[0],
        value[1] >= WAGER_SLIDER_MAX ? Infinity : value[1],
      ],
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

  const handleStatusChange = (status: PositionStatus[]) => {
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
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="hidden md:block absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none z-10" />
        <input
          type="text"
          placeholder={isMobile ? 'Search' : 'Search predictions'}
          value={filters.searchTerm}
          onChange={handleSearchInputChange}
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left pl-3 md:pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>
      <StatusFilter
        options={STATUS_OPTIONS}
        selected={filters.status}
        onChange={handleStatusChange}
        placeholder="Any status"
        allLabel="All statuses"
      />
      <RangeFilter
        placeholder="Any wager"
        value={wagerSliderValue}
        onChange={handleWagerChange}
        min={0}
        max={WAGER_SLIDER_MAX}
        step={10}
        formatValue={(v) => (v >= WAGER_SLIDER_MAX ? '∞' : v.toLocaleString())}
        parseValue={(v) => {
          if (v === '∞') return WAGER_SLIDER_MAX;
          return Number(v.replace(/,/g, ''));
        }}
        unit="USDe"
      />
      <RangeFilter
        placeholder="Any end date"
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
          { range: [0, DATE_SLIDER_MAX], label: 'Ends in the future' },
          { range: [DATE_SLIDER_MIN, 0], label: 'Ended in the past' },
        ]}
      />
    </div>
  );
}

export const getDefaultPositionsFilterState = (): PositionsFilterState => ({
  status: [],
  wagerRange: [0, Infinity],
  dateRange: [-Infinity, Infinity],
  searchTerm: '',
});

export default PositionsTableFilters;
