/**
 * API Throughput scenario (P1) — validates GraphQL under load.
 *
 * Fires queries at increasing concurrency against expensive resolvers.
 * Tracks when 503 load shedding kicks in and validates rate limit behavior.
 */

import type { LoadTestConfig } from '../config';
import { MetricsCollector } from '../metrics';
import { HttpDriver } from '../httpDriver';
import { GRAPHQL_QUERIES, type QueryName } from '../generators';
import { printHeader, printFinalReport, type LiveStats } from '../reporter';

export async function run(config: LoadTestConfig): Promise<void> {
  const { preset, duration } = config;
  const metrics = new MetricsCollector();

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
    'accountStatsLeaderboard',
    'conditions',
    'markets',
  ];

  for (const concurrency of concurrencyLevels) {
    if (Date.now() >= endTime) break;

    console.log(`\nConcurrency: ${concurrency}`);
    const driver = new HttpDriver(config.apiUrl, concurrency, metrics);

    // Run each query type
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
  }

  liveStats.elapsed = (Date.now() - startTime) / 1000;
  printFinalReport(liveStats, metrics);
  console.log('Done.');
}
