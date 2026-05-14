/**
 * Periodic gauge dump for in-flight GraphQL state.
 *
 * Emits one `event:'gql_inflight'` log line per interval with the current
 * active count, peak-since-last-dump, per-operation breakdown, and
 * coarse process resource gauges. This complements the per-event
 * `gql_request` and `gql_shed` lines: events answer "what happened,"
 * the dump answers "what was the snapshot at this moment."
 *
 * Disabled when intervalMs <= 0 (default in prod). Tests / benchmarks
 * opt in via `GRAPHQL_INFLIGHT_DUMP_INTERVAL_MS`.
 *
 * Event-loop delay is sampled via `perf_hooks.monitorEventLoopDelay()`
 * and reset every interval — this is the canonical "is Node falling
 * behind" signal. p99 in milliseconds; sustained values >100ms mean the
 * event loop is starved (CPU work or blocking IO).
 */

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { createLogger } from '../core/logger';
import { inflightRegistry } from './inflightRegistry';

const log = createLogger('inflight-dump');

const NS_PER_MS = 1_000_000;
const BYTES_PER_MB = 1024 * 1024;

/**
 * Re-emit the breakdown sorted by count, descending. JS objects preserve
 * insertion order so the JSON output stays human-readable; downstream
 * aggregators (Loki, Datadog) treat it as an unordered map either way.
 */
function sortByCountDesc(
  byOperation: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(byOperation).sort(([, a], [, b]) => b - a)
  );
}

export function startInflightDump(intervalMs: number): () => void {
  if (intervalMs <= 0) return () => {};

  const eventLoopHist: IntervalHistogram = monitorEventLoopDelay({
    resolution: 20,
  });
  eventLoopHist.enable();

  const handle = setInterval(() => {
    const snap = inflightRegistry.snapshot();
    const peak = inflightRegistry.consumePeak();
    const memory = process.memoryUsage();

    const eventLoopP50Ms = eventLoopHist.percentile(50) / NS_PER_MS;
    const eventLoopP99Ms = eventLoopHist.percentile(99) / NS_PER_MS;
    const eventLoopMaxMs = eventLoopHist.max / NS_PER_MS;
    eventLoopHist.reset();

    log.info(
      {
        event: 'gql_inflight',
        active: snap.active,
        peakSinceLastDump: peak,
        byOperation: sortByCountDesc(snap.byOperation),
        memory: {
          rssMb: Math.round(memory.rss / BYTES_PER_MB),
          heapUsedMb: Math.round(memory.heapUsed / BYTES_PER_MB),
          externalMb: Math.round(memory.external / BYTES_PER_MB),
        },
        eventLoop: {
          p50Ms: Number(eventLoopP50Ms.toFixed(1)),
          p99Ms: Number(eventLoopP99Ms.toFixed(1)),
          maxMs: Number(eventLoopMaxMs.toFixed(1)),
        },
      },
      'gql_inflight'
    );
  }, intervalMs);

  // Don't keep the event loop alive for the dump alone — let SIGTERM win.
  handle.unref?.();

  return () => {
    clearInterval(handle);
    eventLoopHist.disable();
  };
}
