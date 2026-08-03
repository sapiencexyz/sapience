'use client';

import Link from 'next/link';
import { getCategoryStyle, getColorWithAlpha } from '~/lib/utils/categoryStyle';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';

interface FocusAreaBadgeProps {
  categorySlug: string;
}

export function FocusAreaBadge({ categorySlug }: FocusAreaBadgeProps) {
  const style = getCategoryStyle(categorySlug);
  const CategoryIcon = getCategoryIcon(categorySlug);

  if (!style.name) return null;

  return (
    <Link
      href={`/markets?category=${encodeURIComponent(categorySlug)}`}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-[filter] hover:brightness-125"
      style={{
        backgroundColor: getColorWithAlpha(style.color, 0.2),
        boxShadow: `inset 0 0 0 1px ${getColorWithAlpha(style.color, 0.4)}`,
      }}
    >
      <CategoryIcon className="w-4 h-4" style={{ color: style.color }} />
      <span className="text-brand-white">{style.name}</span>
    </Link>
  );
}
