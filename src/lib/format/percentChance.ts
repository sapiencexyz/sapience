export function formatPercentChance(probability: number): string {
  if (!Number.isFinite(probability)) return '—';
  const pct = Math.max(0, Math.min(100, probability * 100));
  if (pct < 1) return '<1%';
  if (pct > 99) return '>99%';
  return `${Math.round(pct)}%`;
}
