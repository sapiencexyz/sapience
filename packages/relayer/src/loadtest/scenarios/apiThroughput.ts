/**
 * API Throughput scenario (P1) — validates GraphQL under load.
 *
 * Fires queries at increasing concurrency against expensive resolvers.
 * Tracks when 503 / 429 load shedding kicks in and validates rate limit
 * behavior. Reports per-operation outcome counts (broken out by which
 * 429 layer fired) and latency percentiles.
 *
 * If `--report-path` was provided, a structured JSON summary is written
 * at the end of the run for `jq`-based diffing between runs.
 */

import { writeFileSync } from 'node:fs';
import type { LoadTestConfig } from '../config';
import { MetricsCollector } from '../metrics';
import {
  HttpDriver,
  type OperationStats,
  type RequestLogEntry,
  type ShedLayer,
} from '../httpDriver';
import { GRAPHQL_QUERIES, type QueryName } from '../generators';
import {
  printHeader,
  printFinalReport,
  printOperationBreakdown,
  buildRunReport,
  type LiveStats,
} from '../reporter';

const ALL_SHED_LAYERS: readonly ShedLayer[] = [
  'ip_rate_limit',
  'ip_concurrency',
  'global',
] as const;

const newOperationStats = (): OperationStats => ({
  total: 0,
  success: 0,
  shedByLayer: { ip_rate_limit: 0, ip_concurrency: 0, global: 0 },
  status503: 0,
  otherErrors: 0,
});

function mergeOperationStats(
  agg: Map<string, OperationStats>,
  delta: Map<string, OperationStats>
): void {
  for (const [name, s] of delta) {
    let target = agg.get(name);
    if (!target) {
      target = newOperationStats();
      agg.set(name, target);
    }
    target.total += s.total;
    target.success += s.success;
    target.status503 += s.status503;
    target.otherErrors += s.otherErrors;
    for (const layer of ALL_SHED_LAYERS) {
      target.shedByLayer[layer] += s.shedByLayer[layer];
    }
  }
}

export async function run(config: LoadTestConfig): Promise<void> {
  const { preset, duration } = config;
  const metrics = new MetricsCollector();
  const aggOpStats = new Map<string, OperationStats>();
  const aggRequestLog: RequestLogEntry[] = [];
  const startedAt = new Date();

  printHeader(
    'api-throughput',
    config.scale,
    duration,
    config.target,
    config.apiUrl
  );

  if (!config.apiUrl) {
    console.error('--api-url is required for api-throughput scenario');
    return;
  }

  const liveStats: LiveStats = {
    connections: { active: 0, failed: 0, rateLimited: 0 },
    auctions: { started: 0, acked: 0, errors: 0 },
    bids: { sent: 0, acked: 0, rejected: 0 },
    msgsSent: 0,
    msgsRecv: 0,
    elapsed: 0,
  };

  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  // Phase 1: Ramp concurrency from 1 to max
  const concurrencyLevels = [1, 5, 10, 20, preset.httpConcurrency];
  const queries: QueryName[] = [
    'protocolStats',
    'profitLeaderboardPage',
    'conditionsPage',
    'questionsPage',
  ];

  const drainDriver = (driver: HttpDriver): void => {
    mergeOperationStats(aggOpStats, driver.operationStats());
    aggRequestLog.push(...driver.drainRequestLog());
  };

  for (const concurrency of concurrencyLevels) {
    if (Date.now() >= endTime) break;

    console.log(`\nConcurrency: ${concurrency}`);
    const driver = new HttpDriver(config.apiUrl, concurrency, metrics);

    for (const queryName of queries) {
      if (Date.now() >= endTime) break;

      const queriesPerRound = Math.max(5, concurrency * 2);
      console.log(`  ${queryName}: firing ${queriesPerRound} queries...`);

      const results = await driver.burst(
        GRAPHQL_QUERIES[queryName],
        queryName,
        queriesPerRound,
        10
      );

      const successes = results.filter((r) => r.status === 200).length;
      const rate429 = results.filter((r) => r.status === 429).length;
      const rate503 = results.filter((r) => r.status === 503).length;

      console.log(`    ok=${successes} 429=${rate429} 503=${rate503}`);

      liveStats.bids.sent += queriesPerRound;
      liveStats.bids.acked += successes;
      liveStats.bids.rejected += rate429 + rate503;

      if (rate503 > 0) {
        console.log(
          `    Load shedding triggered at concurrency=${concurrency}`
        );
      }
    }

    drainDriver(driver);
  }

  // Phase 2: Sustained load at max concurrency
  const remainingMs = endTime - Date.now();
  if (remainingMs > 2000) {
    console.log(
      `\nSustained load at concurrency=${preset.httpConcurrency} for ${Math.round(remainingMs / 1000)}s...`
    );

    const driver = new HttpDriver(
      config.apiUrl,
      preset.httpConcurrency,
      metrics
    );

    while (Date.now() < endTime) {
      const queryName = queries[Math.floor(Math.random() * queries.length)];
      await driver.query(GRAPHQL_QUERIES[queryName], queryName);
      liveStats.bids.sent++;
      const ds = driver.driverStats;
      liveStats.bids.acked = ds.success;
      liveStats.bids.rejected = ds.status429 + ds.status503 + ds.otherErrors;
    }

    const finalDs = driver.driverStats;
    console.log(
      `\nHTTP Summary: total=${finalDs.total} ok=${finalDs.success} 429=${finalDs.status429} 503=${finalDs.status503} err=${finalDs.otherErrors}`
    );

    drainDriver(driver);
  }

  liveStats.elapsed = (Date.now() - startTime) / 1000;
  const finishedAt = new Date();

  printFinalReport(liveStats, metrics);
  printOperationBreakdown(aggOpStats, metrics);

  const totals = Array.from(aggOpStats.values()).reduce(
    (acc, s) => {
      acc.requests += s.total;
      acc.success += s.success;
      acc.status429 +=
        s.shedByLayer.ip_rate_limit +
        s.shedByLayer.ip_concurrency +
        s.shedByLayer.global;
      acc.status503 += s.status503;
      acc.otherErrors += s.otherErrors;
      return acc;
    },
    { requests: 0, success: 0, status429: 0, status503: 0, otherErrors: 0 }
  );

  if (config.reportPath) {
    const report = buildRunReport({
      scenario: 'api-throughput',
      scale: config.scale,
      durationSec: liveStats.elapsed,
      target: config.target,
      apiUrl: config.apiUrl,
      startedAt,
      finishedAt,
      byOperation: aggOpStats,
      metrics,
      totals,
    });
    writeFileSync(config.reportPath, JSON.stringify(report, null, 2));
    console.log(`Report: ${config.reportPath}`);
  }

  if (config.requestLogPath && aggRequestLog.length > 0) {
    const lines = aggRequestLog.map((e) => JSON.stringify(e)).join('\n');
    writeFileSync(config.requestLogPath, lines + '\n');
    console.log(
      `Request log: ${config.requestLogPath} (${aggRequestLog.length} entries)`
    );
  }

  console.log('Done.');
}
