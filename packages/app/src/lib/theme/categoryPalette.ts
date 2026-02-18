'use client';

import { getCssVarHsl } from './cssVars';

const CATEGORY_VAR_NAMES = [
  '--category-1',
  '--category-2',
  '--category-3',
  '--category-4',
  '--category-5',
  '--category-6',
  '--category-7',
] as const;

// Deterministic color selection from category slug
export function getDeterministicCategoryColor(slug: string): string {
  if (!slug) return 'hsl(var(--muted-foreground))';
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % CATEGORY_VAR_NAMES.length;
  return getCssVarHsl(CATEGORY_VAR_NAMES[idx]);
}
