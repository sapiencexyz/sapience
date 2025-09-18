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
    <div className="order-2 md:order-1 flex-1 min-w-0 -mx-4 md:mx-0 pb-3 md:pb-0 border-b border-border md:border-b-0">
      <div
        className="overflow-x-auto overflow-y-visible md:overflow-visible touch-pan-x overscroll-x-contain max-w-[100dvw] md:max-w-[calc(100dvw-4rem)] py-0.5 px-4 md:px-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="w-max flex items-center gap-3.5 md:gap-4">
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
