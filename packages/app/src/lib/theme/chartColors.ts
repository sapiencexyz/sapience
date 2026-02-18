// Centralized chart color palette and helpers (token-driven)
import { getChartColor } from './cssVars';

export const CHART_SERIES_COLORS: string[] = [
  getChartColor(1),
  getChartColor(2),
  getChartColor(3),
  getChartColor(4),
  getChartColor(5),
];

export function getSeriesColorByIndex(seriesIndex: number): string {
  if (Number.isNaN(seriesIndex) || seriesIndex < 0)
    return CHART_SERIES_COLORS[0];
  return CHART_SERIES_COLORS[seriesIndex % CHART_SERIES_COLORS.length];
}

export function withAlpha(color: string, alpha: number): string {
  // Prefer rgba() to avoid hex literals
  const { r, g, b } = parseToRgb(color);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

function parseHslColor(
  hsl: string
): { r: number; g: number; b: number } | null {
  // Accepts strings like "hsl(220 70% 50%)" or "hsl(220, 70%, 50%)" optionally with / alpha
  const match = hsl.replace(/\s+/g, ' ').match(/hsl\(([^)]+)\)/i);
  if (!match) return null;
  const inside = match[1]
    .replace(/\//, ',')
    .replace(/%/g, '')
    .replace(/\s*,\s*/g, ',')
    .trim();
  const parts = inside.split(',').map((p) => p.trim());
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if ([h, s, l].some((v) => Number.isNaN(v))) return null;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (h < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}

function parseRgbColor(
  rgb: string
): { r: number; g: number; b: number } | null {
  const match = rgb.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const [r, g, b] = match[1]
    .split(',')
    .slice(0, 3)
    .map((p) => parseFloat(p.trim()));
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function parseToRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();
  if (c.startsWith('#')) return parseHexColor(c);
  if (c.startsWith('hsl')) {
    const hsl = parseHslColor(c);
    if (hsl) return hsl;
  }
  if (c.startsWith('rgb')) {
    const rgb = parseRgbColor(c);
    if (rgb) return rgb;
  }
  // Fallback to black
  return { r: 0, g: 0, b: 0 };
}
