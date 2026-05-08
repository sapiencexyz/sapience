/**
 * Terminal output: live progress and final summary.
 */

import type { MetricsCollector } from './metrics';
import type { OperationStats, ShedLayer } from './httpDriver';

export interface LiveStats {
  connections: { active: number; failed: number; rateLimited: number };
  auctions: { started: number; acked: number; errors: number };
  bids: { sent: number; acked: number; rejected: number };
  msgsSent: number;
  msgsRecv: number;
  elapsed: number;
}

export interface OperationReport {
  operationName: string;
  total: number;
  success: number;
  shedByLayer: Record<ShedLayer, number>;
  status503: number;
  otherErrors: number;
  latency: { p50: number; p95: number; p99: number; max: number; mean: number };
}

export interface RunReport {
  scenario: string;
  scale: number;
  durationSec: number;
  target: string;
  apiUrl?: string;
  startedAt: string;
  finishedAt: string;
  byOperation: OperationReport[];
  totals: {
    requests: number;
    success: number;
    status429: number;
    status503: number;
    otherErrors: number;
  };
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

/**
 * Per-operation outcome + latency breakdown. Reads operation counters
 * from the HttpDriver and joins them to the latency stream named
 * `http_<operationName>` recorded by the same driver.
 *
 * Renders columns:  total  ok   429 (rl/ipc/glob)  503  err   p50  p95  p99
 *
 * `rl/ipc/glob` are IP_RATE_LIMIT / IP_CONCURRENCY_EXCEEDED / SERVER_BUSY.
 */
export function printOperationBreakdown(
  byOperation: Map<string, OperationStats>,
  metrics: MetricsCollector
): void {
  if (byOperation.size === 0) return;
  console.log('');
  console.log(' BY OPERATION');
  console.log(
    ` ${'name'.padEnd(20)} ${'total'.padStart(7)} ${'ok'.padStart(7)} ${'429 (rl/ipc/glob)'.padStart(20)} ${'503'.padStart(5)} ${'err'.padStart(5)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'p99'.padStart(7)}`
  );
  for (const [name, s] of byOperation) {
    const stream = metrics.get(`http_${name}`);
    const total429 =
      s.shedByLayer.ip_rate_limit +
      s.shedByLayer.ip_concurrency +
      s.shedByLayer.global;
    const shedFmt = `${total429} (${s.shedByLayer.ip_rate_limit}/${s.shedByLayer.ip_concurrency}/${s.shedByLayer.global})`;
    console.log(
      ` ${name.padEnd(20)} ${String(s.total).padStart(7)} ${String(s.success).padStart(7)} ${shedFmt.padStart(20)} ${String(s.status503).padStart(5)} ${String(s.otherErrors).padStart(5)} ${fmt(stream.percentile(50))} ${fmt(stream.percentile(95))} ${fmt(stream.percentile(99))}`
    );
  }
  console.log('');
}

/**
 * Build a structured run report suitable for `JSON.stringify` and
 * subsequent `jq`-based comparison between runs. The shape is stable —
 * additions are safe, removals are not.
 */
export function buildRunReport(args: {
  scenario: string;
  scale: number;
  durationSec: number;
  target: string;
  apiUrl?: string;
  startedAt: Date;
  finishedAt: Date;
  byOperation: Map<string, OperationStats>;
  metrics: MetricsCollector;
  totals: RunReport['totals'];
}): RunReport {
  const byOperationReport: OperationReport[] = [];
  for (const [name, s] of args.byOperation) {
    const stream = args.metrics.get(`http_${name}`);
    byOperationReport.push({
      operationName: name,
      total: s.total,
      success: s.success,
      shedByLayer: { ...s.shedByLayer },
      status503: s.status503,
      otherErrors: s.otherErrors,
      latency: {
        p50: round1(stream.percentile(50)),
        p95: round1(stream.percentile(95)),
        p99: round1(stream.percentile(99)),
        max: round1(stream.max),
        mean: round1(stream.mean),
      },
    });
  }
  return {
    scenario: args.scenario,
    scale: args.scale,
    durationSec: args.durationSec,
    target: args.target,
    apiUrl: args.apiUrl,
    startedAt: args.startedAt.toISOString(),
    finishedAt: args.finishedAt.toISOString(),
    byOperation: byOperationReport,
    totals: args.totals,
  };
}

function round1(n: number): number {
  return Number(n.toFixed(1));
}

function fmt(n: number): string {
  return n.toFixed(0).padStart(7);
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
