'use client';

import type * as React from 'react';
import { Switch } from '@sapience/ui/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import { SquareStack as SquareStackIcon } from 'lucide-react';
import CategoryChips from './CategoryChips';
import type { FocusArea } from '~/lib/constants/focusAreas';

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
}) => {
  return (
    <div className={containerClassName || 'px-0 py-0 w-full'}>
      <div className="w-full min-w-0 flex flex-col min-[1400px]:flex-row items-start min-[1400px]:items-center gap-2">
        {/* Controls row: Parlay left, Status right (mobile). On largest, Status moves to centered sibling */}
        <div className="w-full min-w-0 min-[1400px]:w-auto flex items-center gap-2">
          {/* Parlay toggle */}
          <div className="relative flex items-center gap-2 min-[1400px]:mr-2">
            <SquareStackIcon
              className="h-4 w-4 text-foreground"
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground whitespace-nowrap mr-0.5">
              Parlay Mode
            </span>
            <Switch checked={parlayMode} onCheckedChange={onParlayModeChange} />
          </div>

          {/* Status tabs (mobile/tablet): right-aligned */}
          <div className="ml-auto min-[1400px]:hidden flex items-center mr-0">
            <Tabs
              value={statusFilter}
              onValueChange={(v) =>
                handleStatusFilterClick((v as 'active' | 'all') || 'active')
              }
            >
              <TabsList className="inline-flex items-center p-1">
                <TabsTrigger
                  value="active"
                  className="text-xs px-3 h-8 leading-none rounded-md"
                >
                  Active
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="text-xs px-3 h-8 leading-none rounded-md"
                >
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Desktop tabs are rendered on the right next to chips; omitted here */}
        </div>

        {/* Category chips: below controls on small; inline and right-aligned on largest */}
        <div className="w-full min-w-0 min-[1400px]:flex-1 min-[1400px]:flex min-[1400px]:items-center min-[1400px]:justify-end min-[1400px]:gap-2">
          <CategoryChips
            selectedCategorySlug={selectedCategorySlug}
            onCategoryClick={handleCategoryClick}
            isLoading={isLoadingCategories}
            categories={categories}
            getCategoryStyle={getCategoryStyle}
          />
          {/* Status tabs (desktop >=1400px): placed to the right of chips with spacing */}
          <div className="hidden min-[1400px]:flex items-center ml-4">
            <Tabs
              value={statusFilter}
              onValueChange={(v) =>
                handleStatusFilterClick((v as 'active' | 'all') || 'active')
              }
            >
              <TabsList className="h-8">
                <TabsTrigger value="active" className="text-xs">
                  Active
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs">
                  All
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusAreaFilter;
