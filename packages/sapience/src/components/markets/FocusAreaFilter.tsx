'use client';

import * as React from 'react';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import CategoryChips from './CategoryChips';
import type { FocusArea } from '~/lib/constants/focusAreas';

interface Category {
  id: number;
  slug: string;
  name: string;
}

const selectedStatusClass = 'bg-secondary';
const hoverStatusClass = '';

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
  parlayFeatureEnabled: boolean;
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
  parlayFeatureEnabled,
}) => {
  const [isParlayTooltipOpen, setIsParlayTooltipOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const handleParlayTapOpen = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsParlayTooltipOpen(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsParlayTooltipOpen(false);
      closeTimeoutRef.current = null;
    }, 1500);
  };
  return (
    <div className={containerClassName || 'px-0 py-0 w-full'}>
      <div className="flex flex-col md:flex-row items-start md:items-center md:justify-between gap-2">
        {/* Categories Row */}
        <CategoryChips
          selectedCategorySlug={selectedCategorySlug}
          onCategoryClick={handleCategoryClick}
          isLoading={isLoadingCategories}
          categories={categories}
          getCategoryStyle={getCategoryStyle}
        />

        {/* Status on the right (stacks below on small screens) */}
        <div className="order-1 md:order-2 w-full md:w-auto flex-shrink-0 mb-1 md:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1.5">
              Status
            </span>
            <button
              type="button"
              className={`px-2.5 py-1 text-xs rounded-full ${statusFilter === 'active' ? selectedStatusClass : hoverStatusClass}`}
              onClick={() => handleStatusFilterClick('active')}
            >
              Active
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 text-xs rounded-full ${statusFilter === 'all' ? selectedStatusClass : hoverStatusClass}`}
              onClick={() => handleStatusFilterClick('all')}
            >
              All
            </button>

            <div className="hidden md:block h-4 w-px bg-border mx-1" />
            <div className="ml-auto md:ml-0 flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground ml-2">
                Parlay Mode
              </span>
              {parlayFeatureEnabled ? (
                <Switch
                  checked={parlayMode}
                  onCheckedChange={onParlayModeChange}
                />
              ) : (
                <TooltipProvider>
                  <Tooltip
                    open={isParlayTooltipOpen}
                    onOpenChange={setIsParlayTooltipOpen}
                  >
                    <TooltipTrigger asChild>
                      <div
                        onClick={handleParlayTapOpen}
                        onTouchStart={handleParlayTapOpen}
                      >
                        <Switch checked={false} disabled />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Coming Soon</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusAreaFilter;
