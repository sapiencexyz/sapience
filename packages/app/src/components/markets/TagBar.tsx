'use client';

import { Search } from 'lucide-react';
import { cn } from '@sapience/ui/lib/utils';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';

const POPULAR_TAGS = [
  'Trump',
  'Bitcoin',
  'Ethereum',
  'AI',
  'Fed',
  'Elections',
  'NBA',
  'MLB',
  'Soccer',
  'UFC',
  'Tariffs',
  'Ukraine',
  'Gold',
  'Oil',
  'S&P 500',
  'OpenAI',
  'NCAA',
  'Movies',
  'Elon Musk',
  'Tech',
];

function getTagColor(tag: string): string {
  return getDeterministicCategoryColor(tag.toLowerCase());
}

interface TagBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedTag: string | null;
  onSelectedTagChange: (tag: string | null) => void;
  className?: string;
}

export default function TagBar({
  searchTerm,
  onSearchChange,
  selectedTag,
  onSelectedTagChange,
  className,
}: TagBarProps) {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
    if (selectedTag) {
      onSelectedTagChange(null);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      onSelectedTagChange(null);
    } else {
      onSelectedTagChange(tag);
      if (searchTerm) {
        onSearchChange('');
      }
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Search input */}
      <div className="relative flex items-center shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none z-10" />
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={handleSearchChange}
          className="w-48 xl:w-56 h-8 rounded-md border border-border bg-muted/30 text-left pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
        />
      </div>

      {/* Tag chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
        {POPULAR_TAGS.map((tag) => {
          const isActive = selectedTag === tag;
          const color = getTagColor(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={cn(
                'shrink-0 h-8 rounded-md px-3 inline-flex items-center border font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
                      borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
                    }
                  : {
                      backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
                      borderColor: `color-mix(in srgb, ${color} 20%, transparent)`,
                    }
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
