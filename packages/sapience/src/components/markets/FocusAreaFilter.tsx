'use client';

import type * as React from 'react';
import { Tabs, TabsTrigger } from '@sapience/sdk/ui/components/ui/tabs';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { LayoutGridIcon, ListIcon } from 'lucide-react';
import CategoryChips from './CategoryChips';
import type { FocusArea } from '~/lib/constants/focusAreas';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';

interface Category {
  id: number;
  slug: string;
  name: string;
}

interface FocusAreaFilterProps {
  selectedCategorySlug: string | null;
  handleCategoryClick: (categorySlug: string | null) => void;
  statusFilter: 'all' | 'active';
  handleStatusFilterClick: (filter: 'all' | 'active') => void;
  parlayMode: boolean;
  onParlayModeChange: (enabled: boolean) => void;
  isLoadingCategories: boolean;
  categories: Category[] | null | undefined;
  getCategoryStyle: (categorySlug: string) => FocusArea | undefined;
  containerClassName?: string;
  viewMode: 'list' | 'grid';
  onToggleViewMode: () => void;
  showViewToggle?: boolean;
  // New optional flags for markets page layout tweaks
  showParlayToggle?: boolean;
  hideStatusTabsOnMobile?: boolean;
}

const FocusAreaFilter: React.FC<FocusAreaFilterProps> = ({
  selectedCategorySlug,
  handleCategoryClick,
  statusFilter,
  handleStatusFilterClick,
  parlayMode,
  onParlayModeChange,
  isLoadingCategories,
  categories,
  getCategoryStyle,
  containerClassName,
  viewMode,
  onToggleViewMode,
  showViewToggle,
  showParlayToggle,
  hideStatusTabsOnMobile,
}) => {
  const visibleViewToggle = showViewToggle ?? true;
  const showParlay = showParlayToggle ?? true;
  const statusTabsContainerClassName = `${hideStatusTabsOnMobile ? 'hidden md:flex' : 'flex'} ml-auto flex-nowrap items-center mr-0 gap-2`;
  // Use the same muted primary background treatment as the "All Focus Areas" chip
  const withAlpha = (c: string, alpha: number) => {
    const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    if (hexMatch.test(c)) {
      const a = Math.max(0, Math.min(1, alpha));
      const aHex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0');
      return `${c}${aHex}`;
    }
    const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
      `${fn}(${inside} / ${alpha})`;
    if (c.startsWith('hsl(')) return toSlashAlpha('hsl', c.slice(4, -1));
    if (c.startsWith('rgb(')) return toSlashAlpha('rgb', c.slice(4, -1));
    return c;
  };
  const primaryColor = 'hsl(var(--primary))';
  // Extra-subtle backgrounds
  const segBg = withAlpha(primaryColor, 0.05);
  const segActiveBg = withAlpha(primaryColor, 0.09);
  return (
    <div className={containerClassName || 'px-0 py-0 w-full'}>
      <div className="w-full min-w-0 flex flex-col min-[1400px]:flex-row items-start min-[1400px]:items-center gap-2">
        {/* Controls row: moves to the right on large screens */}
        <div className="w-full min-w-0 min-[1400px]:w-auto flex items-center gap-2 min-[1400px]:order-2 min-[1400px]:justify-end">
          {/* View mode segmented control: Perps (parlay) | Spot */}
          {showParlay ? (
            <div className="relative flex items-center gap-2 min-[1400px]:mr-2">
              <Tabs
                value={parlayMode ? 'perps' : 'spot'}
                onValueChange={(v) => onParlayModeChange(v === 'perps')}
              >
                <SegmentedTabsList>
                  <TabsTrigger value="perps">Parlays</TabsTrigger>
                  <TabsTrigger value="spot">Spot</TabsTrigger>
                </SegmentedTabsList>
              </Tabs>
            </div>
          ) : null}

          {/* Status tabs: visible on all sizes; right-aligned on large */}
          <div className={statusTabsContainerClassName}>
            <Tabs
              value={statusFilter}
              onValueChange={(v) =>
                handleStatusFilterClick((v as 'active' | 'all') || 'active')
              }
            >
              <SegmentedTabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </SegmentedTabsList>
            </Tabs>

            {visibleViewToggle ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="ml-2 h-10 w-10 hidden md:inline-flex bg-[var(--seg-bg)] hover:bg-[var(--seg-active)] border-transparent text-muted-foreground hover:text-foreground"
                      style={{
                        ['--seg-bg' as any]: segBg,
                        ['--seg-active' as any]: segActiveBg,
                      }}
                      aria-label={
                        viewMode === 'grid'
                          ? 'Switch to list view'
                          : 'Switch to grid view'
                      }
                      aria-pressed={viewMode === 'grid'}
                      onClick={onToggleViewMode}
                    >
                      {viewMode === 'grid' ? (
                        <ListIcon className="h-5 w-5" />
                      ) : (
                        <LayoutGridIcon className="h-5 w-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {viewMode === 'grid' ? 'Toggle rows' : 'Toggle cards'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>

        {/* Category chips: left on large; below controls on small */}
        <div className="w-full min-w-0 min-[1400px]:order-1 min-[1400px]:flex-1 min-[1400px]:flex min-[1400px]:items-center min-[1400px]:justify-start min-[1400px]:gap-2">
          <CategoryChips
            selectedCategorySlug={selectedCategorySlug}
            onCategoryClick={handleCategoryClick}
            isLoading={isLoadingCategories}
            categories={categories}
            getCategoryStyle={getCategoryStyle}
          />
        </div>
      </div>
    </div>
  );
};

export default FocusAreaFilter;
