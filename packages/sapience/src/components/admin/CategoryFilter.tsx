'use client';

import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import { cn } from '@foil/ui/lib/utils';

import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';

interface CategoryFilterProps {
  marketGroups: EnrichedMarketGroup[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export default function CategoryFilter({
  marketGroups,
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  // Extract unique categories from market groups
  const categories = Array.from(
    new Map(
      marketGroups
        .filter((group) => group.category)
        .map((group) => [
          group.category.slug,
          {
            id: group.category.id,
            name: group.category.name,
            slug: group.category.slug,
            color: group.category.color || '#6366F1',
          },
        ])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2 min-w-max">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => onCategoryChange(null)}
            className="rounded-full"
          >
            All
          </Button>

          {categories.map((category) => (
            <Badge
              key={category.slug}
              variant="outline"
              className={cn(
                'cursor-pointer px-3 py-1.5 hover:bg-muted transition-colors',
                selectedCategory === category.slug && 'font-semibold'
              )}
              onClick={() => onCategoryChange(category.slug)}
              style={{
                borderColor: category.color,
                backgroundColor:
                  selectedCategory === category.slug
                    ? `${category.color}20` // ~12% opacity
                    : 'transparent',
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
