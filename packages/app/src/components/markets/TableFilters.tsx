'use client';

import * as React from 'react';
import Slider from '@sapience/ui/components/ui/slider';
import { Input } from '@sapience/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sapience/ui/components/ui/command';
import { ChevronsUpDown, Check, Search } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';
import { useIsMobile } from '@sapience/ui/hooks/use-mobile';

export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
}

export interface FilterState {
  openInterestRange: [number, number];
  timeToResolutionRange: [number, number]; // in days, negative = ended
  selectedCategories: string[]; // array of category slugs
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

  const handleToggle = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      onChange(selectedSlugs.filter((s) => s !== slug));
    } else {
      onChange([...selectedSlugs, slug]);
    }
  };

  const handleSelectAll = () => {
    if (selectedSlugs.length === categories.length) {
      onChange([]);
    } else {
      onChange(categories.map((c) => c.slug));
    }
  };

  const getButtonLabel = () => {
    if (selectedSlugs.length === 0) {
      return 'All focus areas';
    }
    if (selectedSlugs.length === 1) {
      const cat = categories.find((c) => c.slug === selectedSlugs[0]);
      return cat?.name || selectedSlugs[0];
    }
    if (selectedSlugs.length === categories.length) {
      return 'All focus areas';
    }
    return `${selectedSlugs.length} focus areas`;
  };

  const isAllSelected =
    selectedSlugs.length === 0 || selectedSlugs.length === categories.length;

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
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search focus areas..." className="h-9" />
          <CommandList>
            <CommandEmpty>No focus area found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={handleSelectAll}
                className="cursor-pointer flex items-center justify-between"
              >
                <span className="font-medium">All focus areas</span>
                <Check
                  className={cn(
                    'h-4 w-4',
                    isAllSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
                  )}
                />
              </CommandItem>
              {categories.map((category) => {
                const isSelected = selectedSlugs.includes(category.slug);
                return (
                  <CommandItem
                    key={category.slug}
                    onSelect={() => handleToggle(category.slug)}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <span>{category.name}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'opacity-100 text-amber-400' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface RangeFilterProps {
  placeholder: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  parseValue?: (value: string) => number;
  unit?: string;
  showSign?: boolean;
  // Custom label to show for specific value ranges
  customLabels?: Array<{ range: [number, number]; label: string }>;
}

function RangeFilter({
  placeholder,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue = (v) => String(v),
  parseValue = (v) => Number(v),
  unit,
  showSign = false,
  customLabels,
}: RangeFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [localMin, setLocalMin] = React.useState(formatValue(value[0]));
  const [localMax, setLocalMax] = React.useState(formatValue(value[1]));

  // Sync local state when value prop changes
  React.useEffect(() => {
    setLocalMin(formatValue(value[0]));
    setLocalMax(formatValue(value[1]));
  }, [value, formatValue]);

  const handleSliderChange = (newValue: number[]) => {
    if (newValue.length >= 2) {
      onChange([newValue[0], newValue[1]]);
    }
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMin(e.target.value);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalMax(e.target.value);
  };

  const handleMinBlur = () => {
    const parsed = parseValue(localMin);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(parsed, value[1]));
      onChange([clamped, value[1]]);
    } else {
      setLocalMin(formatValue(value[0]));
    }
  };

  const handleMaxBlur = () => {
    const parsed = parseValue(localMax);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(parsed, value[0]));
      onChange([value[0], clamped]);
    } else {
      setLocalMax(formatValue(value[1]));
    }
  };

  const handleMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const handleMaxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const isAtBounds = value[0] === min && value[1] === max;

  const formatDisplay = (v: number) => {
    const formatted = formatValue(v);
    if (showSign && v > 0 && formatted !== '∞') return `+${formatted}`;
    return formatted;
  };

  const getButtonLabel = () => {
    if (isAtBounds) return placeholder;
    // Check for custom labels
    if (customLabels) {
      for (const { range, label } of customLabels) {
        if (value[0] === range[0] && value[1] === range[1]) {
          return label;
        }
      }
    }
    return `${formatDisplay(value[0])} – ${formatDisplay(value[1])}${unit ? ` ${unit}` : ''}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left inline-flex items-center justify-between px-3 text-sm"
        >
          <span className={isAtBounds ? 'text-muted-foreground' : ''}>
            {getButtonLabel()}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-4" align="start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{placeholder}</span>
            {!isAtBounds && (
              <button
                type="button"
                onClick={() => onChange([min, max])}
                className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                RESET
              </button>
            )}
          </div>
          <div className="px-1">
            <Slider
              value={[value[0], value[1]]}
              onValueChange={handleSliderChange}
              min={min}
              max={max}
              step={step}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              {showSign && parseValue(localMin) > 0 && localMin !== '∞' && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-foreground pointer-events-none z-10">
                  +
                </span>
              )}
              <Input
                inputSize="xs"
                type="text"
                value={localMin}
                onChange={handleMinInputChange}
                onBlur={handleMinBlur}
                onKeyDown={handleMinKeyDown}
                className={cn(
                  'w-full pr-10 text-right font-mono text-xs tabular-nums',
                  showSign &&
                    parseValue(localMin) > 0 &&
                    localMin !== '∞' &&
                    'pl-5'
                )}
              />
              {unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {unit}
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">to</span>
            <div className="relative flex-1">
              {showSign && parseValue(localMax) > 0 && localMax !== '∞' && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono text-foreground pointer-events-none z-10">
                  +
                </span>
              )}
              <Input
                inputSize="xs"
                type="text"
                value={localMax}
                onChange={handleMaxInputChange}
                onBlur={handleMaxBlur}
                onKeyDown={handleMaxKeyDown}
                className={cn(
                  'w-full pr-10 text-right font-mono text-xs tabular-nums',
                  showSign &&
                    parseValue(localMax) > 0 &&
                    localMax !== '∞' &&
                    'pl-5'
                )}
              />
              {unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {unit}
                </span>
              )}
            </div>
          </div>
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
  searchTerm,
  onSearchChange,
  className,
}: TableFiltersProps) {
  const isMobile = useIsMobile();

  const handleOpenInterestChange = (value: [number, number]) => {
    onFiltersChange({ ...filters, openInterestRange: value });
  };

  const handleTimeToResolutionChange = (value: [number, number]) => {
    onFiltersChange({ ...filters, timeToResolutionRange: value });
  };

  const handleCategoriesChange = (slugs: string[]) => {
    onFiltersChange({ ...filters, selectedCategories: slugs });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
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
          placeholder={
            isMobile ? 'Search questions' : 'Search questions and keywords'
          }
          value={searchTerm}
          onChange={handleSearchInputChange}
          className="w-full h-8 rounded-md border border-border bg-muted/30 text-left pl-3 md:pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>
      <CategoryMultiSelect
        categories={categories}
        selectedSlugs={filters.selectedCategories}
        onChange={handleCategoriesChange}
      />
      <RangeFilter
        placeholder="Any open interest"
        value={filters.openInterestRange}
        onChange={handleOpenInterestChange}
        min={openInterestBounds[0]}
        max={openInterestBounds[1]}
        step={100}
        formatValue={(v) => v.toLocaleString()}
        parseValue={(v) => Number(v.replace(/,/g, ''))}
        unit="USDe"
      />
      <RangeFilter
        placeholder="Time to resolution"
        value={filters.timeToResolutionRange}
        onChange={handleTimeToResolutionChange}
        min={-1000}
        max={1000}
        step={1}
        formatValue={(v) => {
          if (v === 1000) return '∞';
          if (v === -1000) return '-∞';
          return String(v);
        }}
        parseValue={(v) => {
          if (v === '∞') return 1000;
          if (v === '-∞') return -1000;
          return Number(v);
        }}
        unit="days"
        showSign
        customLabels={[
          { range: [0, 1000], label: 'Ends in the future' },
          { range: [-1000, 0], label: 'Ended in the past' },
        ]}
      />
    </div>
  );
}
