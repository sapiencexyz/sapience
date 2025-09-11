// Centralized chart color palette and helpers

export const CHART_SERIES_COLORS: string[] = [
  '#3B82F6', // blue
  '#F87171', // red
  '#4ADE80', // green
  '#F59E0B', // amber
  '#A78BFA', // violet
];

export const CHART_INDEX_COLOR = '#3B82F6';

export function getSeriesColorByIndex(seriesIndex: number): string {
  if (Number.isNaN(seriesIndex) || seriesIndex < 0)
    return CHART_SERIES_COLORS[0];
  return CHART_SERIES_COLORS[seriesIndex % CHART_SERIES_COLORS.length];
}

export function getAccessibleTextColor(
  hexColor: string
): '#000000' | '#FFFFFF' {
  const { r, g, b } = parseHexColor(hexColor);
  // Relative luminance per WCAG
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export function darken(hexColor: string, amount: number = 0.1): string {
  const { r, g, b } = parseHexColor(hexColor);
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r * factor)}${toHex(g * factor)}${toHex(b * factor)}`;
}

export function withAlpha(hexColor: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const alphaByte = Math.round(a * 255);
  const alphaHex = alphaByte.toString(16).padStart(2, '0');
  const normalized = hexColor.replace('#', '');
  // If already 8-digit hex, replace alpha
  const base = normalized.length === 8 ? normalized.slice(0, 6) : normalized;
  return `#${base}${alphaHex}`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let normalized = hex.replace('#', '').trim();
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return { r, g, b };
}
