import type * as React from 'react';
import { LayoutGridIcon, TagIcon } from 'lucide-react';
import { Skeleton } from '@sapience/ui/components/ui/skeleton';
import FocusAreaChip from './FocusAreaChip';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

interface Category {
  id: number;
  slug: string;
  name: string;
}

interface CategoryChipsProps {
  selectedCategorySlug: string | null;
  onCategoryClick: (categorySlug: string | null) => void;
  isLoading: boolean;
  categories: Category[] | null | undefined;
  getCategoryStyle: (
    categorySlug: string
  ) =>
    | { id: string; name: string; color: string; iconSvg?: string }
    | undefined;
}

const DEFAULT_CATEGORY_COLOR = '#71717a';

const CategoryChips: React.FC<CategoryChipsProps> = ({
  selectedCategorySlug,
  onCategoryClick,
  isLoading,
  categories,
  getCategoryStyle,
}) => {
  return (
    <div className="w-full max-w-full min-w-0 box-border mx-0 mt-1.5 min-[1400px]:mt-0 pb-0 md:pb-0 min-[1400px]:w-auto min-[1400px]:max-w-none">
      {/* Mobile: wrapping container with x-scroll; desktop: natural width and right align controlled by parent */}
      <div
        className="overflow-x-auto overflow-y-hidden md:overflow-visible touch-pan-x overscroll-x-contain w-full max-w-full min-w-0 py-1 px-1 md:px-0 min-[1400px]:w-auto min-[1400px]:max-w-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="inline-flex min-w-max min-[1400px]:flex flex-nowrap whitespace-nowrap items-center gap-3.5 md:gap-4 pr-1 md:pr-0">
          <FocusAreaChip
            label="All Focus Areas"
            color={DEFAULT_CATEGORY_COLOR}
            selected={selectedCategorySlug === null}
            onClick={() => onCategoryClick(null)}
            className="py-1"
            IconComponent={LayoutGridIcon}
            iconSize="sm"
          />

          {isLoading &&
            [...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}

          {!isLoading &&
            categories &&
            FOCUS_AREAS.map((focusArea) => {
              const category = categories.find((c) => c.slug === focusArea.id);
              if (!category) return null;
              const styleInfo = getCategoryStyle(category.slug);
              const categoryColor = styleInfo?.color ?? DEFAULT_CATEGORY_COLOR;
              const displayName = styleInfo?.name || category.name;

              return (
                <FocusAreaChip
                  key={category.id}
                  label={displayName}
                  color={categoryColor}
                  selected={selectedCategorySlug === category.slug}
                  onClick={() => onCategoryClick(category.slug)}
                  iconSvg={styleInfo?.iconSvg}
                  IconComponent={styleInfo?.iconSvg ? undefined : TagIcon}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default CategoryChips;
