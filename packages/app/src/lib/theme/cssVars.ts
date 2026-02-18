'use client';

// Read CSS variables from :root as HSL strings, returning a full CSS color like `hsl(...)`.
export function getCssVarHsl(varName: string): string {
  if (typeof window === 'undefined') return '';
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value ? `hsl(${value})` : '';
}

// Convenience getters for chart and semantic variables
export function getChartColor(index: number): string {
  const safe = Math.max(1, Math.min(5, Math.floor(index)));
  return getCssVarHsl(`--chart-${safe}`);
}
