// Probes the API-WIDE 429 path: the global concurrency limiter at
// packages/api/src/runtime/concurrencyLimiter.ts. When more than
// GRAPHQL_MAX_CONCURRENT_OPERATIONS (default 50) requests are in-flight at
// once across ALL clients, every additional request returns 429 with
// extensions.code === "SERVER_BUSY" until slots free up.
//
// To get there we need to bypass two earlier per-IP gates:
//   - express-rate-limit (200/60s/IP, code IP_RATE_LIMIT)
//   - concurrency per-IP (25 in-flight/IP, code IP_CONCURRENCY_EXCEEDED)
//
// Both honor `X-Forwarded-For` via `app.set('trust proxy', 1)`. The script
// stamps each iteration with a fresh random IPv4 so neither per-IP gate fires.
//
// All three 429 layers now return GraphQL-shaped JSON with `extensions.code`,
// so we can disambiguate on the client by reading that single field.
//
// `x-operation-name` is sent so the server-side `gql_shed` log line for the
// rejected request identifies this scenario by name. The trustworthy server
// signal is the occupant snapshot — populated from server-derived parsed
// operation names — which appears on the global-shed warn line itself.
//
// Run:
//   pnpm --filter @sapience/benchmarks run trigger-global-shed
//   API_URL=http://localhost:3001/graphql k6 run scenarios/trigger-global-shed.js
//
// Useful overrides (k6 -e KEY=value):
//   API_URL          — defaults to http://localhost:3001/graphql
//   ARRIVAL_RPS      — sustained request rate during the hold (default 250)
//   HOLD_SECONDS     — how long to hold at peak (default 60)

import http from 'k6/http';
import { Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:3001/graphql';
const ARRIVAL_RPS = Number(__ENV.ARRIVAL_RPS || 250);
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 60);

const status200 = new Counter('status_200');
const serverBusy = new Counter('global_shed_429');
const ipConcurrency = new Counter('per_ip_concurrency_429');
const ipRateLimit = new Counter('per_ip_rate_limit_429');
const status429Other = new Counter('other_429');
const status5xx = new Counter('status_5xx');
const statusOther = new Counter('status_other');

export const options = {
  scenarios: {
    flood: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      // Each in-flight slow request occupies a VU. Heavy-but-valid query below
      // takes ~100–500ms server-side, so to sustain 250 RPS we need ~125 VUs.
      preAllocatedVUs: 200,
      maxVUs: 600,
      stages: [
        { duration: '15s', target: Math.max(10, Math.floor(ARRIVAL_RPS / 4)) },
        { duration: '15s', target: Math.max(20, Math.floor(ARRIVAL_RPS / 2)) },
        { duration: `${HOLD_SECONDS}s`, target: ARRIVAL_RPS },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // The whole point: see at least one global SERVER_BUSY shed.
    global_shed_429: ['count>0'],
  },
  insecureSkipTLSVerify: true,
};

// Heavy-but-valid queries across DIFFERENT root resolvers. Each VU
// iteration picks one at random so the global-shed event's `byOperation`
// snapshot shows real variety — instead of 50 occupants all named
// `conditions`, you see the actual mix of what was holding slots.
//
// Field selections are taken from packages/api/schema.graphql, using only
// the non-deprecated `*Page` wrappers. These all do real DB work — the
// heavier ones (conditionsPage / questionsPage / profitLeaderboardPage)
// are reliably slow enough to fill slots; `protocolStats` is a lighter
// contrast that'll appear in occupant snapshots less often (its slot
// frees faster), which is itself a useful signal.
const HEAVY_QUERIES = [
  {
    name: 'protocolStats',
    query:
      '{ protocolStats { cumulativeVolume openInterest timestamp escrowBalance } }',
  },
  {
    name: 'profitLeaderboardPage',
    query:
      '{ profitLeaderboardPage(limit: 50) { hasMore items { address totalPnL } } }',
  },
  {
    name: 'conditionsPage',
    query:
      '{ conditionsPage(take: 50) { hasMore items { id question endTime openInterest chainId settled predictionCount } } }',
  },
  {
    name: 'questionsPage',
    query:
      '{ questionsPage(take: 50) { hasMore items { questionType predictionCount condition { id question endTime openInterest } } } }',
  },
];

function pickQuery() {
  return HEAVY_QUERIES[(Math.random() * HEAVY_QUERIES.length) | 0];
}

function randomIp() {
  // 10.0.0.0/8 — RFC1918, never resolved or routed; safe sentinel range.
  const b = (Math.random() * 256) | 0;
  const c = (Math.random() * 256) | 0;
  const d = 1 + ((Math.random() * 254) | 0);
  return `10.${b}.${c}.${d}`;
}

export default function () {
  const choice = pickQuery();
  const res = http.post(
    API_URL,
    JSON.stringify({ query: choice.query }),
    {
      headers: {
        'Content-Type': 'application/json',
        // Both rate limiter and concurrency limiter take the rightmost X-F-F
        // entry as the client IP (trust proxy: 1). Random per request so neither
        // per-IP gate sees a repeat client.
        'X-Forwarded-For': randomIp(),
        // Identifies this iteration in pre-parse `gql_shed` lines (rate-limit
        // layer can't see resolver names). Once admitted, the server-derived
        // `rootResolvers` in `gql_request` is the trustworthy source.
        'x-operation-name': `global_shed_probe:${choice.name}`,
      },
      tags: { op: 'global_shed_probe', resolver: choice.name },
    }
  );

  if (res.status === 200) {
    status200.add(1);
    return;
  }

  if (res.status === 429) {
    // Disambiguate by extensions.code — all three 429 layers now return a
    // GraphQL-shaped body. Anything we don't recognize falls into other_429.
    let code = '';
    try {
      const body = res.json();
      code = body?.errors?.[0]?.extensions?.code || '';
    } catch (_) {
      // Non-JSON body — shouldn't happen with the new handlers, but fall
      // through so we still account for it.
    }

    if (code === 'SERVER_BUSY') serverBusy.add(1);
    else if (code === 'IP_CONCURRENCY_EXCEEDED') ipConcurrency.add(1);
    else if (code === 'IP_RATE_LIMIT') ipRateLimit.add(1);
    else status429Other.add(1, { code: code || 'unknown' });
    return;
  }

  if (res.status >= 500 && res.status < 600) {
    status5xx.add(1, { code: String(res.status) });
    return;
  }

  statusOther.add(1, { code: String(res.status) });
}

export function handleSummary(data) {
  const m = data.metrics;
  const get = (k) => (m[k] ? m[k].values.count : 0);
  const ok = get('status_200');
  const shed = get('global_shed_429');
  const ipConc = get('per_ip_concurrency_429');
  const ipRate = get('per_ip_rate_limit_429');
  const otherShed = get('other_429');
  const fivex = get('status_5xx');
  const other = get('status_other');
  const total = ok + shed + ipConc + ipRate + otherShed + fivex + other;

  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  const lines = [
    '',
    '=== Global concurrency shed probe ===',
    `  Target:                       ${API_URL}`,
    `  Peak arrival rate:            ${ARRIVAL_RPS} RPS`,
    `  Total requests:               ${total}`,
    `  200 OK:                       ${ok}  (${pct(ok)}%)`,
    `  429 SERVER_BUSY (global):     ${shed}  (${pct(shed)}%)   <-- the API-wide 429`,
    `  429 IP_CONCURRENCY_EXCEEDED:  ${ipConc}  (${pct(ipConc)}%)`,
    `  429 IP_RATE_LIMIT:            ${ipRate}  (${pct(ipRate)}%)`,
    `  429 (other code):             ${otherShed}  (${pct(otherShed)}%)`,
    `  5xx:                          ${fivex}  (${pct(fivex)}%)`,
    `  Other:                        ${other}  (${pct(other)}%)`,
    '',
  ].join('\n');

  return { stdout: lines };
}
