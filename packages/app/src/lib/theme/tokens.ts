// Shared theme tokens (mirror of globals.css values) for environments
// where CSS variables are unavailable (e.g., OG image generation).

export const themeTokens = {
  light: {
    background: '0 0% 100%',
    foreground: '240 10% 3.9%',
    success: '142 72% 35%',
    warning: '38 92% 50%',
    info: '217 91% 60%',
    up: '142 72% 35%',
    down: '0 84% 60%',
    chart: [
      '12 76% 61%',
      '173 58% 39%',
      '197 37% 24%',
      '43 74% 66%',
      '27 87% 67%',
    ],
  },
  dark: {
    background: '222 16% 9%',
    foreground: '37 41% 83%',
    success: '142 72% 45%',
    warning: '38 92% 55%',
    info: '217 91% 70%',
    up: '142 72% 45%',
    down: '0 84% 65%',
    chart: [
      '220 70% 50%',
      '160 60% 45%',
      '30 80% 55%',
      '280 65% 60%',
      '340 75% 55%',
    ],
  },
} as const;

export function hslTokenToCss(hsl: string): string {
  return `hsl(${hsl})`;
}
