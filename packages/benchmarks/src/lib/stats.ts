export interface Stats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  total: number;
  successes: number;
  failures: number;
  successRate: number;
  rps: number;
}

export function computeStats(
  samples: { durationMs: number; success: boolean }[],
  elapsedMs: number
): Stats {
  const total = samples.length;
  if (total === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, total: 0, successes: 0, failures: 0, successRate: 0, rps: 0 };
  }

  const successes = samples.filter((s) => s.success).length;
  const failures = total - successes;
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);

  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / total;
  const min = durations[0];
  const max = durations[total - 1];

  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * total) - 1;
    return durations[Math.max(0, Math.min(idx, total - 1))];
  };

  const elapsedSec = elapsedMs / 1000;
  const rps = elapsedSec > 0 ? total / elapsedSec : 0;

  return {
    min,
    max,
    avg,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    total,
    successes,
    failures,
    successRate: (successes / total) * 100,
    rps,
  };
}
