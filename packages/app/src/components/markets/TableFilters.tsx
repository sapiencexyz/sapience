'use client';

import * as React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import Slider from '@sapience/ui/components/ui/slider';
import { Input } from '@sapience/ui/components/ui/input';
import {
  ChevronsUpDown,
  Check,
  ChevronRight,
  Globe,
  LayoutGrid,
  DollarSign,
  TrendingUp,
  Coins,
  CloudSun,
  Landmark,
  FlaskConical,
  Medal,
  Tv,
  Wheat,
  Bitcoin,
  BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';
import ResolutionStatusFilter, {
  type ResolutionStatusFilterValue,
} from './ResolutionStatusFilter';
import { RangeFilter } from '~/components/shared/RangeFilter';

export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
}

export interface FilterState {
  openInterestRange: [number, number];
  similarMarketVolumeRange: [number, number]; // all-time
  similarMarketVolume1hRange: [number, number];
  similarMarketVolume4hRange: [number, number];
  similarMarketVolume24hRange: [number, number];
  similarMarketVolume7dRange: [number, number];
  timeToResolutionRange: [number, number]; // in days, negative = ended
  selectedCategories: string[]; // array of category slugs
  resolutionStatus: ResolutionStatusFilterValue;
  estimatedPriceRange: [number, number]; // 0-100, displayed as percentage
}

type VolumeRangeKey =
  | 'similarMarketVolumeRange'
  | 'similarMarketVolume1hRange'
  | 'similarMarketVolume4hRange'
  | 'similarMarketVolume24hRange'
  | 'similarMarketVolume7dRange';

interface TableFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  // Bounds for the filters (computed from data)
  openInterestBounds: [number, number];
  timeToResolutionBounds: [number, number];
  // Available categories for the dropdown
  categories: CategoryOption[];
  className?: string;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'economy-finance': TrendingUp,
  crypto: Coins,
  weather: CloudSun,
  geopolitics: Landmark,
  'tech-science': FlaskConical,
  sports: Medal,
  culture: Tv,
  'prices-commodities': Wheat,
  'prices-crypto': Bitcoin,
  'prices-equity': BarChart3,
};

interface CategoryMultiSelectProps {
  categories: CategoryOption[];
  selectedSlugs: string[];
  onChange: (slugs: string[]) => void;
}

function CategoryMultiSelect({
  categories,
  selectedSlugs,
  onChange,
}: CategoryMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [pmExpanded, setPmExpanded] = React.useState(true);
  const [pricesExpanded, setPricesExpanded] = React.useState(false);

  // Separate prediction-market categories from price asset-class categories
  const predictionMarketCategories = categories.filter(
    (c) => !c.slug.startsWith('prices-')
  );
  const pricesCategories = categories.filter((c) =>
    c.slug.startsWith('prices-')
  );

  const handleToggle = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      onChange(selectedSlugs.filter((s) => s !== slug));
    } else {
      onChange([...selectedSlugs, slug]);
    }
  };

  const handleSelectAll = () => {
    if (
      selectedSlugs.length === categories.length ||
      selectedSlugs.length === 0
    ) {
      onChange([]);
    } else {
      onChange(categories.map((c) => c.slug));
    }
  };

  const handleToggleGroup = (groupCategories: CategoryOption[]) => {
    const groupSlugs = groupCategories.map((c) => c.slug);
    const allSelected = groupSlugs.every((s) => selectedSlugs.includes(s));
    if (allSelected) {
      onChange(selectedSlugs.filter((s) => !groupSlugs.includes(s)));
    } else {
      onChange([...new Set([...selectedSlugs, ...groupSlugs])]);
    }
  };

  const getButtonLabel = () => {
    if (selectedSlugs.length === 0) {
      return 'All Markets';
    }
    if (selectedSlugs.length === categories.length) {
      return 'All Markets';
    }
    const pmSlugSet = new Set(predictionMarketCategories.map((c) => c.slug));
    if (
      selectedSlugs.length === pmSlugSet.size &&
      selectedSlugs.every((s) => pmSlugSet.has(s))
    ) {
      return 'Polymarkets';
    }
    const pricesSlugSet = new Set(pricesCategories.map((c) => c.slug));
    if (
      selectedSlugs.length === pricesSlugSet.size &&
      selectedSlugs.every((s) => pricesSlugSet.has(s))
    ) {
      return 'Prices';
    }
    if (selectedSlugs.length === 1) {
      const cat = categories.find((c) => c.slug === selectedSlugs[0]);
      return cat?.name || selectedSlugs[0];
    }
    return `${selectedSlugs.length} markets`;
  };

  const isAllSelected =
    selectedSlugs.length === 0 || selectedSlugs.length === categories.length;

  const pmSlugs = predictionMarketCategories.map((c) => c.slug);
  const allPmSelected =
    pmSlugs.length > 0 && pmSlugs.every((s) => selectedSlugs.includes(s));
  const somePmSelected = pmSlugs.some((s) => selectedSlugs.includes(s));

  const pricesSlugs = pricesCategories.map((c) => c.slug);
  const allPricesSelected =
    pricesSlugs.length > 0 &&
    pricesSlugs.every((s) => selectedSlugs.includes(s));
  const somePricesSelected = pricesSlugs.some((s) => selectedSlugs.includes(s));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between gap-2 px-3 text-sm"
        >
          <span
            className={cn(
              'min-w-0 truncate',
              selectedSlugs.length === 0 && 'text-muted-foreground'
            )}
          >
            {getButtonLabel()}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-1" align="start">
        <div className="flex flex-col">
          {/* All Markets */}
          <button
            type="button"
            onClick={handleSelectAll}
            className="cursor-pointer flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span className="font-medium flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 opacity-60" />
              All Markets
            </span>
            <Check
              className={cn(
                'h-4 w-4',
                isAllSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
              )}
            />
          </button>

          {/* Polymarkets group */}
          <div className="mt-1">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setPmExpanded(!pmExpanded)}
                className="p-1 rounded-sm hover:bg-accent"
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    pmExpanded && 'rotate-90'
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleToggleGroup(predictionMarketCategories)}
                className="flex-1 cursor-pointer flex items-center justify-between rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
              >
                <span className="font-medium flex items-center gap-2">
                  <LayoutGrid className="h-3.5 w-3.5 opacity-60" />
                  Polymarkets
                </span>
                <Check
                  className={cn(
                    'h-4 w-4',
                    allPmSelected
                      ? 'opacity-100 text-amber-400'
                      : somePmSelected
                        ? 'opacity-100 text-amber-400/50'
                        : 'opacity-0'
                  )}
                />
              </button>
            </div>
            {pmExpanded &&
              predictionMarketCategories.map((category) => {
                const isSelected = selectedSlugs.includes(category.slug);
                const Icon = CATEGORY_ICONS[category.slug];
                return (
                  <button
                    type="button"
                    key={category.slug}
                    onClick={() => handleToggle(category.slug)}
                    className="w-full cursor-pointer flex items-center justify-between rounded-sm pl-8 pr-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      {Icon && <Icon className="h-3.5 w-3.5 opacity-60" />}
                      {category.name}
                    </span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
                      )}
                    />
                  </button>
                );
              })}
          </div>

          {/* Prices group */}
          {pricesCategories.length > 0 && (
            <div className="mt-1">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setPricesExpanded(!pricesExpanded)}
                  className="p-1 rounded-sm hover:bg-accent"
                >
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      pricesExpanded && 'rotate-90'
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleGroup(pricesCategories)}
                  className="flex-1 cursor-pointer flex items-center justify-between rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
                >
                  <span className="font-medium flex items-center gap-2">
                    <DollarSign className="h-3.5 w-3.5 opacity-60" />
                    Prices
                  </span>
                  <Check
                    className={cn(
                      'h-4 w-4',
                      allPricesSelected
                        ? 'opacity-100 text-amber-400'
                        : somePricesSelected
                          ? 'opacity-100 text-amber-400/50'
                          : 'opacity-0'
                    )}
                  />
                </button>
              </div>
              {pricesExpanded &&
                pricesCategories.map((category) => {
                  const isSelected = selectedSlugs.includes(category.slug);
                  const Icon = CATEGORY_ICONS[category.slug];
                  return (
                    <button
                      type="button"
                      key={category.slug}
                      onClick={() => handleToggle(category.slug)}
                      className="w-full cursor-pointer flex items-center justify-between rounded-sm pl-8 pr-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span className="flex items-center gap-2">
                        {Icon && <Icon className="h-3.5 w-3.5 opacity-60" />}
                        {category.name}
                      </span>
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected
                            ? 'opacity-100 text-amber-400'
                            : 'opacity-0'
                        )}
                      />
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Map slider bounds to Infinity for range filters
const OPEN_INTEREST_SLIDER_MAX = 1000000;
const VOLUME_SLIDER_STEP = 10000;
const TIME_SLIDER_MAX = 1000;
const TIME_SLIDER_MIN = -1000;

const formatVolumeValue = (v: number, max: number): string => {
  if (v >= max) return '∞';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
};

const parseVolumeValue = (raw: string, max: number): number => {
  if (raw === '∞') return max;
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1_000_000;
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1_000;
  return Number(cleaned);
};

interface VolumeRangeRowProps {
  label: string;
  value: [number, number];
  max: number;
  onChange: (value: [number, number]) => void;
}

function VolumeRangeRow({ label, value, max, onChange }: VolumeRangeRowProps) {
  const committedValue: [number, number] = [
    value[0],
    value[1] === Infinity ? max : Math.min(value[1], max),
  ];
  // Local state tracks the slider position while dragging; only committed on release.
  const [dragValue, setDragValue] = React.useState<[number, number] | null>(
    null
  );
  const displayValue = dragValue ?? committedValue;
  const [localMin, setLocalMin] = React.useState(
    formatVolumeValue(committedValue[0], max)
  );
  const [localMax, setLocalMax] = React.useState(
    formatVolumeValue(committedValue[1], max)
  );

  const committedMin = committedValue[0];
  const committedMax = committedValue[1];
  React.useEffect(() => {
    setLocalMin(formatVolumeValue(committedMin, max));
    setLocalMax(formatVolumeValue(committedMax, max));
  }, [committedMin, committedMax, max]);

  const emit = (next: [number, number]) => {
    onChange([next[0], next[1] >= max ? Infinity : next[1]]);
  };

  const handleSliderChange = (newValue: number[]) => {
    if (newValue.length >= 2) setDragValue([newValue[0], newValue[1]]);
  };

  const handleSliderCommit = (newValue: number[]) => {
    if (newValue.length >= 2) emit([newValue[0], newValue[1]]);
    setDragValue(null);
  };

  const commitMin = () => {
    const parsed = parseVolumeValue(localMin, max);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(parsed, committedValue[1]));
      emit([clamped, committedValue[1]]);
    } else {
      setLocalMin(formatVolumeValue(committedValue[0], max));
    }
  };

  const commitMax = () => {
    const parsed = parseVolumeValue(localMax, max);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(parsed, committedValue[0]));
      emit([committedValue[0], clamped]);
    } else {
      setLocalMax(formatVolumeValue(committedValue[1], max));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-mono">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatVolumeValue(displayValue[0], max)}
          {' → '}
          {formatVolumeValue(displayValue[1], max)}
        </span>
      </div>
      <div className="px-1 py-1">
        <Slider
          value={displayValue}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          min={0}
          max={max}
          step={VOLUME_SLIDER_STEP}
          className="w-full"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          inputSize="xs"
          type="text"
          value={localMin}
          onChange={(e) => setLocalMin(e.target.value)}
          onBlur={commitMin}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-full text-right font-mono text-xs tabular-nums"
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          inputSize="xs"
          type="text"
          value={localMax}
          onChange={(e) => setLocalMax(e.target.value)}
          onBlur={commitMax}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-full text-right font-mono text-xs tabular-nums"
        />
      </div>
    </div>
  );
}

interface RelatedVolumeFilterProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

function RelatedVolumeFilter({
  filters,
  onFiltersChange,
}: RelatedVolumeFilterProps) {
  const [open, setOpen] = React.useState(false);

  const allTimeRow = {
    label: 'ALL-TIME',
    key: 'similarMarketVolumeRange' as const,
    max: 50_000_000,
  };
  const windowBands: Array<
    Array<{
      label: string;
      key: VolumeRangeKey;
      max: number;
    }>
  > = [
    [
      { label: 'LAST 7D', key: 'similarMarketVolume7dRange', max: 25_000_000 },
      { label: 'LAST 4H', key: 'similarMarketVolume4hRange', max: 2_500_000 },
    ],
    [
      {
        label: 'LAST 24H',
        key: 'similarMarketVolume24hRange',
        max: 5_000_000,
      },
      { label: 'LAST 1H', key: 'similarMarketVolume1hRange', max: 1_000_000 },
    ],
  ];
  const windowRows = windowBands.flat();

  const activeCount = [allTimeRow, ...windowRows].filter(({ key, max }) => {
    const r = filters[key];
    if (!Array.isArray(r) || r.length !== 2) return false;
    const [lo, hi] = r;
    const loActive = typeof lo === 'number' && lo > 0;
    const hiActive = typeof hi === 'number' && Number.isFinite(hi) && hi < max;
    return loActive || hiActive;
  }).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between gap-2 px-3 text-sm"
        >
          <span
            className={cn(
              'min-w-0 truncate',
              activeCount === 0 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            Related Volume
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] max-w-[calc(100vw-1rem)] p-0"
        align="start"
      >
        <div className="flex flex-col divide-y divide-border/60">
          <div className="p-3">
            <VolumeRangeRow
              label={allTimeRow.label}
              value={filters[allTimeRow.key]}
              max={allTimeRow.max}
              onChange={(value) =>
                onFiltersChange({ ...filters, [allTimeRow.key]: value })
              }
            />
          </div>
          {windowBands.map((band, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60"
            >
              {band.map(({ label, key, max }) => (
                <div key={key} className="p-3">
                  <VolumeRangeRow
                    label={label}
                    value={filters[key]}
                    max={max}
                    onChange={(value) =>
                      onFiltersChange({ ...filters, [key]: value })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function TableFilters({
  filters,
  onFiltersChange,
  openInterestBounds,
  timeToResolutionBounds: _timeToResolutionBounds,
  categories,
  className,
}: TableFiltersProps) {
  // Map Infinity to slider max for display
  const openInterestSliderValue: [number, number] = [
    filters.openInterestRange[0],
    filters.openInterestRange[1] === Infinity
      ? OPEN_INTEREST_SLIDER_MAX
      : Math.min(filters.openInterestRange[1], OPEN_INTEREST_SLIDER_MAX),
  ];

  const handleOpenInterestChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      openInterestRange: [
        value[0],
        value[1] >= OPEN_INTEREST_SLIDER_MAX ? Infinity : value[1],
      ],
    });
  };

  // Map Infinity/-Infinity to slider bounds for time display
  const timeSliderValue: [number, number] = [
    filters.timeToResolutionRange[0] === -Infinity
      ? TIME_SLIDER_MIN
      : Math.max(filters.timeToResolutionRange[0], TIME_SLIDER_MIN),
    filters.timeToResolutionRange[1] === Infinity
      ? TIME_SLIDER_MAX
      : Math.min(filters.timeToResolutionRange[1], TIME_SLIDER_MAX),
  ];

  const handleTimeToResolutionChange = (value: [number, number]) => {
    onFiltersChange({
      ...filters,
      timeToResolutionRange: [
        value[0] <= TIME_SLIDER_MIN ? -Infinity : value[0],
        value[1] >= TIME_SLIDER_MAX ? Infinity : value[1],
      ],
    });
  };

  const handleCategoriesChange = (slugs: string[]) => {
    onFiltersChange({ ...filters, selectedCategories: slugs });
  };

  const handleEstimatedPriceChange = (value: [number, number]) => {
    onFiltersChange({ ...filters, estimatedPriceRange: value });
  };

  const handleResolutionStatusChange = (
    status: ResolutionStatusFilterValue
  ) => {
    onFiltersChange({ ...filters, resolutionStatus: status });
  };

  return (
    <div
      className={cn(
        'grid gap-2 lg:gap-4 grid-cols-2 lg:grid-cols-6',
        className
      )}
    >
      <CategoryMultiSelect
        categories={categories}
        selectedSlugs={filters.selectedCategories}
        onChange={handleCategoriesChange}
      />
      <RangeFilter
        placeholder="Forecast"
        value={filters.estimatedPriceRange ?? [0, 100]}
        onChange={handleEstimatedPriceChange}
        min={0}
        max={100}
        step={1}
        formatValue={(v) => `${v}%`}
        parseValue={(v) => Number(v.replace(/%/g, ''))}
      />
      <RangeFilter
        placeholder="Open Interest"
        value={openInterestSliderValue}
        onChange={handleOpenInterestChange}
        min={openInterestBounds[0]}
        max={OPEN_INTEREST_SLIDER_MAX}
        step={100}
        formatValue={(v) =>
          v >= OPEN_INTEREST_SLIDER_MAX ? '∞' : v.toLocaleString()
        }
        parseValue={(v) => {
          if (v === '∞') return OPEN_INTEREST_SLIDER_MAX;
          return Number(v.replace(/,/g, ''));
        }}
        unit="OI"
      />
      <RelatedVolumeFilter
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <RangeFilter
        placeholder="Ends in"
        value={timeSliderValue}
        onChange={handleTimeToResolutionChange}
        min={TIME_SLIDER_MIN}
        max={TIME_SLIDER_MAX}
        step={1}
        formatValue={(v) => {
          if (v >= TIME_SLIDER_MAX) return '∞';
          if (v <= TIME_SLIDER_MIN) return '-∞';
          return String(v);
        }}
        parseValue={(v) => {
          if (v === '∞') return TIME_SLIDER_MAX;
          if (v === '-∞') return TIME_SLIDER_MIN;
          return Number(v);
        }}
        unit="days"
        showSign
        customLabels={[
          { range: [0, TIME_SLIDER_MAX], label: 'Ends in the future' },
          { range: [TIME_SLIDER_MIN, 0], label: 'Ended in the past' },
        ]}
      />
      <div>
        <ResolutionStatusFilter
          value={filters.resolutionStatus}
          onChange={handleResolutionStatusChange}
        />
      </div>
    </div>
  );
}
