'use client';

import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';

const DEFAULT_CATEGORY_COLOR = 'hsl(var(--muted-foreground))';

/**
 * Converts a color string to include alpha transparency.
 * Supports hsl(), rgb(), and hex color formats.
 */
export function getColorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('hsl(')) {
    return `hsl(${color.slice(4, -1)} / ${alpha})`;
  }
  if (color.startsWith('rgb(')) {
    return `rgb(${color.slice(4, -1)} / ${alpha})`;
  }
  // Hex color: append alpha as hex (e.g., 0.1 = 1a)
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alphaHex}`;
}

export const getCategoryStyle = (categorySlug?: string | null) => {
  const slug = categorySlug || '';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === slug);
  if (focusArea) {
    return { color: focusArea.color, id: focusArea.id, name: focusArea.name };
  }
  if (!slug) return { color: DEFAULT_CATEGORY_COLOR, id: '', name: '' };
  return {
    color: getDeterministicCategoryColor(slug) || DEFAULT_CATEGORY_COLOR,
    id: slug,
    name: '',
  };
};
