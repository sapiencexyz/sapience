#!/usr/bin/env tsx
/**
 * Sapience Load Test — CLI entry point.
 *
 * Generates cryptographically valid EIP-712 auction traffic and measures
 * latency across WebSocket (relayer) and HTTP (API) paths.
 *
 * Usage:
 *   pnpm --filter @sapience/relayer run load-test -- --scenario escrow-auction --scale 1 --duration 30
 *   pnpm --filter @sapience/relayer run load-test -- --help
 */

import { parseArgs } from 'util';
import { getPreset, isProductionUrl, type LoadTestConfig } from './src/loadtest/config';
import { scrapeMetricsDelta } from './src/loadtest/reporter';

// Strip bare '--' from argv so pnpm's separator doesn't confuse parseArgs
const argv = process.argv.slice(2).filter((a) => a !== '--');

const args = parseArgs({
  args: argv,
  options: {
    scenario: { type: 'string', default: 'escrow-auction' },
    target: { type: 'string', default: 'ws://localhost:3002/auction' },
    'api-url': { type: 'string', default: '' },
    scale: { type: 'string', default: '1' },
    duration: { type: 'string', default: '30' },
    'ramp-up': { type: 'string', default: '5' },
    'metrics-url': { type: 'string', default: '' },
    'confirm-production': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (args.values.help) {
  console.log(`
Sapience Load Test

Scenarios:
  escrow-auction          Full auction lifecycle (default)
  api-throughput          GraphQL throughput + 503 validation
  mixed-workload          Combined WS + GraphQL traffic

Options:
  --scenario <name>       Scenario to run (default: escrow-auction)
  --target <url>          WebSocket URL (default: ws://localhost:3002/auction)
  --api-url <url>         GraphQL API URL (required for api-throughput, mixed-workload)
  --scale <n>             Scale multiplier: 1, 10, or 100 (default: 1)
  --duration <seconds>    Test duration (default: 30)
  --ramp-up <seconds>     Connection ramp-up time (default: 5)
  --metrics-url <url>     Relayer /metrics endpoint for Prometheus delta
  --confirm-production    Required when targeting production URLs
  --help                  Show this help

Examples:
  pnpm --filter @sapience/relayer run load-test -- --scenario escrow-auction --scale 1 --duration 10
  pnpm --filter @sapience/relayer run load-test -- --scenario api-throughput --api-url http://localhost:3001/graphql --scale 10
  pnpm --filter @sapience/relayer run load-test -- --scenario mixed-workload --scale 10 --duration 60 --api-url http://localhost:3001/graphql
`);
  process.exit(0);
}

const target = args.values.target || 'ws://localhost:3002/auction';
const apiUrl = args.values['api-url'] || '';
const scale = parseInt(args.values.scale || '1', 10);

// Safety check for production URLs
if (
  (isProductionUrl(target) || isProductionUrl(apiUrl)) &&
  !args.values['confirm-production']
) {
  console.error(
    'ERROR: Target appears to be a production URL. Pass --confirm-production to proceed.'
  );
  process.exit(1);
}

const config: LoadTestConfig = {
  scenario: args.values.scenario || 'escrow-auction',
  target,
  apiUrl,
  scale,
  duration: parseInt(args.values.duration || '30', 10),
  rampUp: parseInt(args.values['ramp-up'] || '5', 10),
  metricsUrl: args.values['metrics-url'] || undefined,
  confirmProduction: args.values['confirm-production'] || false,
  preset: getPreset(scale),
};

async function main() {
  // Scrape metrics at start if URL provided
  let metricsStart: string | null = null;
  if (config.metricsUrl) {
    metricsStart = await scrapeMetricsDelta(config.metricsUrl);
    if (metricsStart) {
      console.log(`Scraped baseline metrics from ${config.metricsUrl}`);
    }
  }

  // Dispatch to scenario
  switch (config.scenario) {
    case 'escrow-auction': {
      const { run } = await import('./src/loadtest/scenarios/escrowAuction');
      await run(config);
      break;
    }
    case 'api-throughput': {
      const { run } = await import('./src/loadtest/scenarios/apiThroughput');
      await run(config);
      break;
    }
    case 'mixed-workload': {
      const { run } = await import('./src/loadtest/scenarios/mixedWorkload');
      await run(config);
      break;
    }
    default:
      console.error(`Unknown scenario: ${config.scenario}`);
      console.error(
        'Available: escrow-auction, api-throughput, mixed-workload'
      );
      process.exit(1);
  }

  // Scrape metrics at end and report delta
  if (config.metricsUrl && metricsStart) {
    const metricsEnd = await scrapeMetricsDelta(config.metricsUrl);
    if (metricsEnd) {
      console.log('\n--- Prometheus Metrics Delta ---');
      reportMetricsDelta(metricsStart, metricsEnd);
    }
  }
}

function reportMetricsDelta(start: string, end: string): void {
  const interestingMetrics = [
    'process_resident_memory_bytes',
    'nodejs_eventloop_lag_seconds',
    'ws_active_connections',
    'ws_active_subscriptions',
    'ws_messages_total',
  ];

  for (const metricName of interestingMetrics) {
    const startVal = extractMetricValue(start, metricName);
    const endVal = extractMetricValue(end, metricName);
    if (startVal !== null && endVal !== null) {
      const delta = endVal - startVal;
      const label = delta >= 0 ? `+${formatNumber(delta)}` : formatNumber(delta);
      console.log(
        `  ${metricName.padEnd(40)} ${formatNumber(endVal).padStart(12)} (${label})`
      );
    }
  }
}

function extractMetricValue(text: string, name: string): number | null {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith(name) && !line.startsWith('#')) {
      const parts = line.split(/\s+/);
      const val = parseFloat(parts[parts.length - 1]);
      if (!isNaN(val)) return val;
    }
  }
  return null;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
