'use client';

import * as React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  ChevronsUpDown,
  Check,
  Search,
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
  timeToResolutionRange: [number, number]; // in days, negative = ended
  selectedCategories: string[]; // array of category slugs
  resolutionStatus: ResolutionStatusFilterValue;
}

interface TableFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  // Bounds for the filters (computed from data)
  openInterestBounds: [number, number];
  timeToResolutionBounds: [number, number];
  // Available categories for the dropdown
  categories: CategoryOption[];
  // Search input
  searchTerm: string;
  onSearchChange: (value: string) => void;
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
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between px-3 text-sm"
        >
          <span
            className={
              selectedSlugs.length === 0 ? 'text-muted-foreground' : ''
            }
          >
            {getButtonLabel()}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
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
const TIME_SLIDER_MAX = 1000;
const TIME_SLIDER_MIN = -1000;

export default function TableFilters({
  filters,
  onFiltersChange,
  openInterestBounds,
  timeToResolutionBounds: _timeToResolutionBounds,
  categories,
  searchTerm,
  onSearchChange,
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

  const handleResolutionStatusChange = (
    status: ResolutionStatusFilterValue
  ) => {
    onFiltersChange({ ...filters, resolutionStatus: status });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  return (
    <div
      className={cn(
        'grid gap-2 xl:gap-4 grid-cols-2 xl:grid-cols-5',
        className
      )}
    >
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="hidden xl:block absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none z-10" />
        <input
          type="text"
          placeholder="Search questions"
          value={searchTerm}
          onChange={handleSearchInputChange}
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left pl-3 xl:pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>
      <CategoryMultiSelect
        categories={categories}
        selectedSlugs={filters.selectedCategories}
        onChange={handleCategoriesChange}
      />
      <RangeFilter
        placeholder="Any open interest"
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
      <RangeFilter
        placeholder="Time to resolution"
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
      <div className="col-span-2 xl:col-span-1">
        <ResolutionStatusFilter
          value={filters.resolutionStatus}
          onChange={handleResolutionStatusChange}
        />
      </div>
    </div>
  );
}
