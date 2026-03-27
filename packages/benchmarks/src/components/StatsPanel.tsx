import type { Stats } from '../lib/stats';

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

export function StatsPanel({ stats, label }: { stats: Stats; label?: string }) {
  return (
    <div className="stats-panel">
      {label && <h4>{label}</h4>}
      <div className="stats-hero-row">
        <div className="stats-hero">
          <span className="stats-hero-label">Min</span>
          <span className="stats-hero-value">{fmt(stats.min)}<span className="stats-hero-unit">ms</span></span>
        </div>
        <div className="stats-hero stats-hero-primary">
          <span className="stats-hero-label">Avg</span>
          <span className="stats-hero-value">{fmt(stats.avg)}<span className="stats-hero-unit">ms</span></span>
        </div>
        <div className="stats-hero">
          <span className="stats-hero-label">Max</span>
          <span className="stats-hero-value">{fmt(stats.max)}<span className="stats-hero-unit">ms</span></span>
        </div>
      </div>
      <div className="stats-secondary">
        <span>Total: {stats.total}</span>
        <span>Success: {fmt(stats.successRate)}%</span>
        <span>RPS: {fmt(stats.rps, 2)}</span>
        <span>P50: {fmt(stats.p50)}ms</span>
        <span>P95: {fmt(stats.p95)}ms</span>
        <span>P99: {fmt(stats.p99)}ms</span>
      </div>
    </div>
  );
}
