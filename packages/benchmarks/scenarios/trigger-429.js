// Probes the per-IP express-rate-limit gate (one of three 429 sources in the API).
// Default config in packages/api: 200 requests per 60s window per IP.
//
// What this WILL trip:
//   express-rate-limit at packages/api/src/runtime/middleware.ts (per-IP, 200/60s)
//   — body: { errors: [{ extensions: { code: "IP_RATE_LIMIT" } }] }
//
// What this will NOT trip (use trigger-global-shed.js for that):
//   - concurrency limiter, per-IP (25 in-flight) — code IP_CONCURRENCY_EXCEEDED
//   - concurrency limiter, global (50 in-flight) — code SERVER_BUSY (API-wide)
//
// The script ramps a constant request rate from 1 → 10 RPS over ~3 minutes
// from a single client IP, then holds. With the default limit a sustained
// 10 RPS exhausts the 200-req bucket roughly 20s into the hold window;
// after that ~70% of requests should come back 429.
//
// `x-operation-name` is sent so the server's `gql_shed` log line identifies
// this scenario by name — see packages/api/src/runtime/middleware.ts handler.
//
// Run:
//   pnpm --filter @sapience/benchmarks run trigger-429
//   API_URL=http://localhost:3001/graphql k6 run scenarios/trigger-429.js
//
// Useful overrides (k6 -e KEY=value):
//   API_URL                — defaults to http://localhost:3001/graphql
//   PEAK_RPS               — top of the ramp (default 10)
//   HOLD_SECONDS           — how long to hold at peak (default 90)

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:3001/graphql';
const PEAK_RPS = Number(__ENV.PEAK_RPS || 10);
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 90);

const status200 = new Counter('status_200');
const status429 = new Counter('status_429');
const statusOther = new Counter('status_other');

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: Math.max(1, Math.floor(PEAK_RPS / 2)) },
        { duration: '30s', target: PEAK_RPS },
        { duration: `${HOLD_SECONDS}s`, target: PEAK_RPS },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // The whole point of this run is to *see* 429s. Fail the run if we never
    // tripped the limiter — that means either the limit is mis-configured or
    // PEAK_RPS is too low for the configured window.
    status_429: ['count>0'],
  },
  // Don't let the per-request retry policy mask 429s.
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
};

// Use a real (cheap) resolver instead of `{ __typename }` so admitted
// requests show up in the server's `gql_request.rootResolvers` field as
// `{ protocolStats: 1 }` — i.e. attributable to a concrete resolver.
// Pre-rejection 429s only surface the header's claimed name; this gives
// the *admitted* requests something to aggregate by.
//
// Field names are taken from packages/api/schema.graphql (type ProtocolStat).
const payload = JSON.stringify({
  query: '{ protocolStats { cumulativeVolume openInterest timestamp } }',
});
const params = {
  headers: {
    'Content-Type': 'application/json',
    'x-operation-name': 'rate_limit_probe',
  },
  // Tag so per-status metrics are easy to slice if you --out json=...
  tags: { op: 'rate_limit_probe' },
};

export default function () {
  const res = http.post(API_URL, payload, params);

  if (res.status === 200) {
    status200.add(1);
  } else if (res.status === 429) {
    status429.add(1);
  } else {
    statusOther.add(1, { code: String(res.status) });
  }

  check(res, {
    'status is 200 or 429 (no 5xx)': (r) => r.status === 200 || r.status === 429,
  });
}

export function handleSummary(data) {
  const m = data.metrics;
  const ok = m.status_200 ? m.status_200.values.count : 0;
  const blocked = m.status_429 ? m.status_429.values.count : 0;
  const other = m.status_other ? m.status_other.values.count : 0;
  const total = ok + blocked + other;

  const lines = [
    '',
    '=== Rate-limit probe summary ===',
    `  Target:           ${API_URL}`,
    `  Peak RPS:         ${PEAK_RPS}`,
    `  Total requests:   ${total}`,
    `  200 OK:           ${ok}`,
    `  429 Too Many:     ${blocked}  (${total ? ((blocked / total) * 100).toFixed(1) : '0'}%)`,
    `  Other statuses:   ${other}`,
    '',
  ].join('\n');

  return {
    stdout: lines,
  };
}
