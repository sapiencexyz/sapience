/**
 * Terminal output: live progress and final summary.
 */

import type { MetricsCollector } from './metrics';

export interface LiveStats {
  connections: { active: number; failed: number; rateLimited: number };
  auctions: { started: number; acked: number; errors: number };
  bids: { sent: number; acked: number; rejected: number };
  msgsSent: number;
  msgsRecv: number;
  elapsed: number;
}

export function printHeader(
  scenario: string,
  scale: number,
  duration: number,
  target: string,
  apiUrl?: string
): void {
  console.log('');
  console.log('Sapience Load Test');
  console.log(
    `Scenario: ${scenario} | Scale: ${scale}x | Duration: ${duration}s`
  );
  console.log(`Target: ${target}`);
  if (apiUrl) console.log(`API:    ${apiUrl}`);
  console.log('');
}

export function printLiveStats(stats: LiveStats): void {
  const throughput =
    stats.elapsed > 0
      ? `msgs_sent=${Math.round(stats.msgsSent / stats.elapsed)}/s  msgs_recv=${Math.round(stats.msgsRecv / stats.elapsed)}/s`
      : '';

  process.stdout.write(
    `\r CONN active=${stats.connections.active} failed=${stats.connections.failed} | ` +
      `AUC started=${stats.auctions.started} acked=${stats.auctions.acked} err=${stats.auctions.errors} | ` +
      `BID sent=${stats.bids.sent} acked=${stats.bids.acked} rej=${stats.bids.rejected} | ` +
      throughput
  );
}

export function printFinalReport(
  stats: LiveStats,
  metrics: MetricsCollector
): void {
  console.log('\n');
  console.log('========================================');
  console.log(' FINAL RESULTS');
  console.log('========================================');

  console.log('');
  console.log(
    ` CONNECTIONS  active=${stats.connections.active}   failed=${stats.connections.failed}   rate_limited=${stats.connections.rateLimited}`
  );
  console.log(
    ` AUCTIONS     started=${stats.auctions.started}  acked=${stats.auctions.acked}  errors=${stats.auctions.errors}`
  );
  console.log(
    ` BIDS         sent=${stats.bids.sent}   acked=${stats.bids.acked}  rejected=${stats.bids.rejected}`
  );

  const streams = metrics.all().filter((s) => s.totalCount > 0);
  if (streams.length > 0) {
    console.log('');
    console.log(
      ` ${'LATENCY (ms)'.padEnd(28)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'p99'.padStart(8)} ${'max'.padStart(8)}`
    );
    for (const s of streams) {
      console.log(
        ` ${s.name.padEnd(28)} ${fmt(s.percentile(50))} ${fmt(s.percentile(95))} ${fmt(s.percentile(99))} ${fmt(s.max)}`
      );
    }
  }

  const dur = stats.elapsed || 1;
  console.log('');
  console.log(
    ` THROUGHPUT   msgs_sent=${Math.round(stats.msgsSent / dur)}/s  msgs_recv=${Math.round(stats.msgsRecv / dur)}/s`
  );
  console.log('');
}

function fmt(n: number): string {
  return n.toFixed(0).padStart(8);
}

export async function scrapeMetricsDelta(
  metricsUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(metricsUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
