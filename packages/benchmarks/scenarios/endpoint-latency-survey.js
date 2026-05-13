// Endpoint latency survey: pings every Query field on the GraphQL API
// sequentially and reports per-endpoint min / p50 / p95 / max so we can
// see which resolvers are worth optimizing.
//
// Run model:
//   1 VU, sequential. We measure server-side latency in isolation —
//   no concurrency contention from k6 itself. (Use trigger-global-shed.js
//   if you want the concurrency limiter in the picture.)
//
// Each request stamps a fresh random RFC1918 IPv4 in `X-Forwarded-For` so
// neither per-IP gate fires: ~50 endpoints × N iterations easily exceeds the
// 200-req/60s express-rate-limit bucket from a single client IP, which would
// otherwise 429 most samples and contaminate the latency trends. The API
// honors X-F-F via `app.set('trust proxy', 1)` in middleware.ts.
//
// setup() hits a few list endpoints to discover real seed IDs (a condition,
// a prediction, a user, a trade, a chainId). ID-dependent endpoints are
// skipped with a warning when no seed is found, so an empty local DB still
// produces a useful report for the no-arg / list endpoints.
//
// k6 1.x requires every metric to be declared in init context, so the full
// endpoint catalog and the cross-product of (endpoint × known codes)
// Counters are built at module top-level.
//
// Run:
//   pnpm --filter @sapience/benchmarks run survey-endpoints
//   API_URL=http://localhost:3001/graphql k6 run scenarios/endpoint-latency-survey.js
//
// Useful overrides (k6 -e KEY=value):
//   API_URL              — defaults to http://localhost:3001/graphql
//   ITERATIONS           — samples per endpoint (default 20)
//   INCLUDE_DEPRECATED   — "true" to include @deprecated fields as `__D`
//                          rows (default "false" — surveys only the live
//                          surface that will survive the migration)
//   VAULT_ADDRESS        — seed for the `vaultStats` endpoint (no auto-discovery)
//   FIXED_CLIENT_IP      — pin every request to this X-F-F value instead of
//                          rotating; useful if you actually *want* to measure
//                          rate-limiter behavior.
//   VERBOSE              — "true" to log a line per request showing endpoint,
//                          HTTP status, and duration. Default off; the regular
//                          run already logs one sample per (endpoint, code)
//                          failure shape, which is usually enough.

import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:3001/graphql';
const VERBOSE = (__ENV.VERBOSE || 'false') === 'true';
const ITERATIONS = Number(__ENV.ITERATIONS || 20);
const INCLUDE_DEPRECATED = (__ENV.INCLUDE_DEPRECATED || 'false') === 'true';
const FIXED_CLIENT_IP = __ENV.FIXED_CLIENT_IP || null;

// RFC1918 — never resolved or routed; safe sentinel range for X-F-F.
function clientIp() {
  if (FIXED_CLIENT_IP) return FIXED_CLIENT_IP;
  const b = (Math.random() * 256) | 0;
  const c = (Math.random() * 256) | 0;
  const d = 1 + ((Math.random() * 254) | 0);
  return `10.${b}.${c}.${d}`;
}

export const options = {
  scenarios: {
    survey: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: ITERATIONS,
      maxDuration: '15m',
      gracefulStop: '30s',
    },
  },
  insecureSkipTLSVerify: true,
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'max', 'count'],
};

// ----- Endpoint catalog ----------------------------------------------------
//
// Single source of truth. queryFn(seed) returns the GraphQL document, or
// null if the endpoint needs seed data that wasn't discovered (in which
// case it's counted in `survey_skipped` and not measured).
//
// Selections are deliberately thin but include nested relations where
// DataLoaders are interesting (Pick.condition, User, pickConfig), since
// the N+1 cost lives there.

const ALL_ENDPOINTS = [
  // -- No-arg / scalar-only ----
  { name: 'popularTags', deprecated: false,
    queryFn: () => '{ popularTags }' },
  { name: 'openInterestByCategory', deprecated: false,
    queryFn: () => '{ openInterestByCategory { category { id slug } openInterest } }' },
  { name: 'openInterestByTimeToResolution', deprecated: false,
    queryFn: () => '{ openInterestByTimeToResolution { bucket label openInterest predictionCount } }' },
  { name: 'protocolStats', deprecated: false,
    queryFn: () => '{ protocolStats { cumulativeVolume openInterest escrowBalance timestamp } }' },

  // -- Paginated lists ----
  { name: 'accuracyLeaderboardPage', deprecated: false,
    queryFn: () => '{ accuracyLeaderboardPage(take: 10) { hasMore totalCount items { address accuracyScore } } }' },
  { name: 'profitLeaderboardPage', deprecated: false,
    queryFn: () => '{ profitLeaderboardPage(take: 10) { hasMore totalCount items { address totalPnL } } }' },
  { name: 'categoriesPage', deprecated: false,
    queryFn: () => '{ categoriesPage(take: 100) { hasMore totalCount items { id name slug } } }' },
  { name: 'conditionGroupsPage', deprecated: false,
    queryFn: () => '{ conditionGroupsPage(take: 50) { hasMore totalCount items { id name similarMarkets } } }' },
  { name: 'conditionsPage', deprecated: false,
    queryFn: () => '{ conditionsPage(take: 50) { hasMore totalCount items { id question endTime openInterest chainId settled predictionCount } } }' },
  { name: 'pickConfigurationsPage', deprecated: false,
    queryFn: () => '{ pickConfigurationsPage(take: 50) { hasMore totalCount items { id chainId marketAddress endsAt } } }' },
  { name: 'questionsPage', deprecated: false,
    queryFn: () => '{ questionsPage(take: 50) { hasMore totalCount items { questionType predictionCount condition { id question endTime openInterest } group { id name } } } }' },
  { name: 'tradesPage', deprecated: false,
    queryFn: () => '{ tradesPage(take: 50) { hasMore totalCount items { id buyer seller price token chainId } } }' },
  { name: 'predictionsPage', deprecated: false,
    queryFn: () => '{ predictionsPage(take: 50) { hasMore totalCount items { id chainId counterparty counterpartyCollateral } } }' },
  { name: 'positionsPage', deprecated: false,
    queryFn: () => '{ positionsPage(take: 50) { hasMore totalCount items { id holder balance pickConfig { id endsAt } } } }' },
  { name: 'attestationsPage', deprecated: false,
    queryFn: () => '{ attestationsPage(take: 50) { hasMore totalCount items { id attester recipient time condition { id } } } }' },
  { name: 'referralCodesPage', deprecated: false,
    queryFn: () => '{ referralCodesPage(take: 100) { hasMore totalCount items { id createdBy isActive } } }' },

  // -- Single-ID lookups (need seed) ----
  { name: 'condition', deprecated: false,
    queryFn: (s) => s.conditionId ? `{ condition(id: "${s.conditionId}") { id question endTime openInterest } }` : null },
  { name: 'conditionGroup', deprecated: false,
    queryFn: (s) => s.conditionGroupId != null ? `{ conditionGroup(id: ${s.conditionGroupId}) { id name similarMarkets } }` : null },
  { name: 'prediction', deprecated: false,
    queryFn: (s) => s.predictionId ? `{ prediction(id: "${s.predictionId}") { id chainId counterparty } }` : null },
  { name: 'trade', deprecated: false,
    queryFn: (s) => s.tradeId ? `{ trade(id: "${s.tradeId}") { id buyer seller price token } }` : null },
  { name: 'user', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ user(address: "${s.userAddress}") { id address } }` : null },

  // -- Address-driven analytics (need userAddress) ----
  { name: 'accountAccuracyRank', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountAccuracyRank(address: "${s.userAddress}") { rank accuracyScore totalForecasters } }` : null },
  { name: 'accountTotalVolume', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountTotalVolume(address: "${s.userAddress}") }` : null },
  { name: 'accountBalance', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountBalance(address: "${s.userAddress}", interval: DAY) { timestamp deployedCollateral claimableCollateral } }` : null },
  { name: 'accountPnl', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountPnl(address: "${s.userAddress}", interval: DAY) { timestamp } }` : null },
  { name: 'accountPredictionCount', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountPredictionCount(address: "${s.userAddress}", interval: DAY) { timestamp } }` : null },
  { name: 'accountVolume', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountVolume(address: "${s.userAddress}", interval: DAY) { timestamp } }` : null },
  { name: 'accountActivityPage', deprecated: false,
    queryFn: (s) => s.userAddress ? `{ accountActivityPage(address: "${s.userAddress}", take: 20) { hasMore items { type timestamp } } }` : null },

  // -- userAddress + chainId ----
  { name: 'collateralBalance', deprecated: false,
    queryFn: (s) => (s.userAddress && s.chainId != null) ? `{ collateralBalance(address: "${s.userAddress}", chainId: ${s.chainId}) { address balance chainId } }` : null },
  { name: 'collateralBalanceHistory', deprecated: false,
    queryFn: (s) => (s.userAddress && s.chainId != null) ? `{ collateralBalanceHistory(address: "${s.userAddress}", chainId: ${s.chainId}) { timestamp balance index } }` : null },
  { name: 'collateralTransfersPage', deprecated: false,
    queryFn: (s) => (s.userAddress && s.chainId != null) ? `{ collateralTransfersPage(address: "${s.userAddress}", chainId: ${s.chainId}, take: 50) { hasMore items { blockNumber chainId from } } }` : null },

  // -- vault (env-only seed) ----
  { name: 'vaultStats', deprecated: false,
    queryFn: (s) => s.vaultAddress ? `{ vaultStats(vaultAddress: "${s.vaultAddress}") { timestamp vaultBalance vaultCumulativePnL } }` : null },

  // -- Deprecated mirrors ----
  { name: 'accuracyLeaderboard__D', deprecated: true,
    queryFn: () => '{ accuracyLeaderboard(limit: 10) { address accuracyScore } }' },
  { name: 'profitLeaderboard__D', deprecated: true,
    queryFn: () => '{ profitLeaderboard(limit: 10) { address totalPnL } }' },
  { name: 'categories__D', deprecated: true,
    queryFn: () => '{ categories(take: 100) { id name slug } }' },
  { name: 'conditionGroups__D', deprecated: true,
    queryFn: () => '{ conditionGroups(take: 50) { id name } }' },
  { name: 'conditions__D', deprecated: true,
    queryFn: () => '{ conditions(take: 50) { id question endTime openInterest } }' },
  { name: 'questions__D', deprecated: true,
    queryFn: () => '{ questions(take: 50) { questionType predictionCount condition { id } } }' },
  { name: 'pickConfigurations__D', deprecated: true,
    queryFn: () => '{ pickConfigurations(take: 50) { id chainId } }' },
  { name: 'predictions__D', deprecated: true,
    queryFn: () => '{ predictions(take: 50) { id counterparty } }' },
  { name: 'positions__D', deprecated: true,
    queryFn: () => '{ positions(take: 50) { id holder balance } }' },
  { name: 'trades__D', deprecated: true,
    queryFn: () => '{ trades(take: 50) { id buyer seller price } }' },
  { name: 'attestations__D', deprecated: true,
    queryFn: () => '{ attestations(take: 50) { id attester time } }' },
  { name: 'accountActivity__D', deprecated: true,
    queryFn: (s) => s.userAddress ? `{ accountActivity(address: "${s.userAddress}", take: 20) { type timestamp } }` : null },
  { name: 'collateralTransfers__D', deprecated: true,
    queryFn: (s) => (s.userAddress && s.chainId != null) ? `{ collateralTransfers(address: "${s.userAddress}", chainId: ${s.chainId}, limit: 100) { blockNumber from } }` : null },
  { name: 'accountAccuracy__D', deprecated: true,
    queryFn: (s) => s.userAddress ? `{ accountAccuracy(address: "${s.userAddress}") { address accuracyScore } }` : null },
  { name: 'accountProfitRank__D', deprecated: true,
    queryFn: (s) => s.userAddress ? `{ accountProfitRank(address: "${s.userAddress}") { rank totalPnL totalParticipants } }` : null },
  { name: 'predictionCount__D', deprecated: true,
    queryFn: (s) => s.userAddress ? `{ predictionCount(address: "${s.userAddress}") }` : null },
  { name: 'positionCount__D', deprecated: true,
    queryFn: (s) => s.userAddress ? `{ positionCount(holder: "${s.userAddress}") }` : null },
  { name: 'tradeCount__D', deprecated: true,
    queryFn: () => '{ tradeCount }' },
  { name: 'claims__D', deprecated: true,
    queryFn: () => '{ claims(take: 50) { id chainId holder predictionId redeemedAt } }' },
  { name: 'closes__D', deprecated: true,
    queryFn: () => '{ closes(take: 50) { id chainId pickConfigId burnedAt } }' },
  { name: 'protocolVolume__D', deprecated: true,
    queryFn: () => '{ protocolVolume(interval: DAY) { timestamp } }' },
];

const ENDPOINTS = ALL_ENDPOINTS.filter(
  (e) => !e.deprecated || INCLUDE_DEPRECATED
);

// ----- Metric declarations (must be in init context) ----------------------

// k6 1.x requires metric names to match /^[a-zA-Z_][a-zA-Z0-9_]*$/.
// All endpoint names in the catalog above already satisfy that.
const latency = {};
for (const e of ENDPOINTS) {
  latency[e.name] = new Trend(`lat__${e.name}`, true);
}

// Codes we expect to see. Unknown codes are folded into `_other`.
// Keep the list aligned with the three 429 layers and common GraphQL
// codes; anything not in here ends up in a fallback `_other` bucket.
//
// 400 = Apollo returns this with `extensions.code` for schema mismatches
// (GRAPHQL_VALIDATION_FAILED), arg validation (BAD_USER_INPUT), and
// parse errors (GRAPHQL_PARSE_FAILED). Surfacing the code rather than
// burying it under http_4xx_other makes it obvious when prod is on a
// schema version that doesn't have an endpoint yet (the survey's first
// occurrence of each (endpoint, code) also logs a snippet of the actual
// error message so you can see exactly what the server said).
const KNOWN_CODES = [
  'http_429_SERVER_BUSY',
  'http_429_IP_RATE_LIMIT',
  'http_429_IP_CONCURRENCY_EXCEEDED',
  'http_429_other',
  'http_400_GRAPHQL_VALIDATION_FAILED',
  'http_400_GRAPHQL_PARSE_FAILED',
  'http_400_BAD_USER_INPUT',
  'http_400_other',
  'http_4xx_other',
  'http_5xx_other',
  'gql_BAD_USER_INPUT',
  'gql_GRAPHQL_VALIDATION_FAILED',
  'gql_INTERNAL_SERVER_ERROR',
  'gql_other',
];

// Per-VU memory of which (endpoint, code) pairs we've already logged a
// sample for. Keeps the diagnostic log tight: one line per distinct
// failure shape, not one per iteration.
const sampledErrorPairs = new Set();

const unexpected = {};
for (const e of ENDPOINTS) {
  unexpected[e.name] = {};
  for (const c of KNOWN_CODES) {
    unexpected[e.name][c] = new Counter(`unexp__${e.name}__${c}`);
  }
}

const skippedEndpoints = new Counter('survey_skipped');

// Map a raw HTTP status + GraphQL extensions.code pair to one of KNOWN_CODES.
function classifyCode(status, gqlCode) {
  if (status === 200) {
    if (!gqlCode) return 'gql_other';
    const key = `gql_${gqlCode}`;
    return KNOWN_CODES.includes(key) ? key : 'gql_other';
  }
  if (status === 429) {
    if (gqlCode) {
      const key = `http_429_${gqlCode}`;
      if (KNOWN_CODES.includes(key)) return key;
    }
    return 'http_429_other';
  }
  if (status === 400) {
    if (gqlCode) {
      const key = `http_400_${gqlCode}`;
      if (KNOWN_CODES.includes(key)) return key;
    }
    return 'http_400_other';
  }
  if (status >= 500 && status < 600) return 'http_5xx_other';
  if (status >= 400 && status < 500) return 'http_4xx_other';
  return 'http_4xx_other'; // fallback for any 1xx/3xx oddities
}

// On first occurrence of a given (endpoint, code) pair, console.log a
// trimmed sample of the actual server response + the query that triggered
// it. Lets the operator diagnose without re-running with verbose flags.
function logSampleOnce(endpoint, code, status, queryBody, parsed, rawBody) {
  const key = `${endpoint}::${code}`;
  if (sampledErrorPairs.has(key)) return;
  sampledErrorPairs.add(key);
  let snippet = '';
  const msg = parsed?.errors?.[0]?.message;
  if (msg) {
    snippet = String(msg).slice(0, 240);
  } else if (rawBody) {
    snippet = String(rawBody).slice(0, 240).replace(/\s+/g, ' ');
  }
  const compactQuery = String(queryBody).replace(/\s+/g, ' ').slice(0, 200);
  // eslint-disable-next-line no-console
  console.warn(
    `[survey/error] ${endpoint} -> ${code} (HTTP ${status})\n` +
      `  query:    ${compactQuery}\n` +
      `  response: ${snippet || '(empty body)'}`
  );
}

// ----- Setup: discover real seed IDs --------------------------------------

function gqlOnce(query, opName) {
  const res = http.post(API_URL, JSON.stringify({ query }), {
    headers: {
      'Content-Type': 'application/json',
      'x-operation-name': opName || 'survey_setup',
      'X-Forwarded-For': clientIp(),
    },
    tags: { phase: 'setup' },
  });
  if (res.status !== 200) return null;
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export function setup() {
  const seed = {
    conditionId: null,
    conditionGroupId: null,
    predictionId: null,
    tradeId: null,
    userAddress: null,
    chainId: null,
    vaultAddress: null,
  };

  const conditions = gqlOnce(
    '{ conditionsPage(take: 1) { items { id chainId } } }',
    'survey_seed_conditions'
  );
  const condItem = conditions?.data?.conditionsPage?.items?.[0];
  if (condItem) {
    seed.conditionId = condItem.id;
    seed.chainId = condItem.chainId;
  }

  const cg = gqlOnce(
    '{ conditionGroupsPage(take: 1) { items { id } } }',
    'survey_seed_condition_groups'
  );
  seed.conditionGroupId = cg?.data?.conditionGroupsPage?.items?.[0]?.id ?? null;

  const preds = gqlOnce(
    '{ predictionsPage(take: 1) { items { id chainId } } }',
    'survey_seed_predictions'
  );
  const predItem = preds?.data?.predictionsPage?.items?.[0];
  if (predItem) {
    seed.predictionId = predItem.id;
    if (seed.chainId == null) seed.chainId = predItem.chainId;
  }

  const trades = gqlOnce(
    '{ tradesPage(take: 1) { items { id buyer chainId } } }',
    'survey_seed_trades'
  );
  const tradeItem = trades?.data?.tradesPage?.items?.[0];
  if (tradeItem) {
    seed.tradeId = tradeItem.id;
    if (!seed.userAddress) seed.userAddress = tradeItem.buyer;
    if (seed.chainId == null) seed.chainId = tradeItem.chainId;
  }

  if (!seed.userAddress) {
    const lb = gqlOnce(
      '{ profitLeaderboardPage(take: 1) { items { address } } }',
      'survey_seed_leaderboard'
    );
    seed.userAddress = lb?.data?.profitLeaderboardPage?.items?.[0]?.address ?? null;
  }

  if (!seed.userAddress) {
    const acc = gqlOnce(
      '{ accuracyLeaderboardPage(take: 1) { items { address } } }',
      'survey_seed_accuracy'
    );
    seed.userAddress = acc?.data?.accuracyLeaderboardPage?.items?.[0]?.address ?? null;
  }

  if (!seed.userAddress) {
    const positions = gqlOnce(
      '{ positionsPage(take: 1) { items { holder } } }',
      'survey_seed_positions'
    );
    seed.userAddress = positions?.data?.positionsPage?.items?.[0]?.holder ?? null;
  }

  seed.vaultAddress = __ENV.VAULT_ADDRESS || null;

  // eslint-disable-next-line no-console
  console.log(
    `[survey/setup] seed: ${JSON.stringify(seed)}` +
      (seed.conditionId && seed.userAddress && seed.chainId != null
        ? ''
        : ' — some endpoints will be skipped (missing seed data)')
  );

  return seed;
}

// ----- Per-iteration sweep -------------------------------------------------

export default function (seed) {
  for (const ep of ENDPOINTS) {
    const body = ep.queryFn(seed);
    if (!body) {
      skippedEndpoints.add(1, { endpoint: ep.name });
      continue;
    }

    const res = http.post(API_URL, JSON.stringify({ query: body }), {
      headers: {
        'Content-Type': 'application/json',
        'x-operation-name': `survey:${ep.name}`,
        // Fresh IP per request — bypasses the per-IP rate limit (200/60s)
        // and the per-IP concurrency gate (25 in-flight). Without this,
        // a single survey iteration exhausts the IP bucket and most
        // latency samples become 429 fast-path times, not real resolver
        // work. See module header for details.
        'X-Forwarded-For': clientIp(),
      },
      tags: { phase: 'survey', endpoint: ep.name },
    });

    latency[ep.name].add(res.timings.duration);

    // Both 200-with-errors and 4xx/5xx now return GraphQL-shaped JSON
    // with `extensions.code` (SERVER_BUSY / IP_RATE_LIMIT / etc.), so
    // we want the code in either case.
    let parsed = null;
    try {
      parsed = res.json();
    } catch (_) {
      // non-JSON body — fall through with parsed=null
    }
    const gqlCode = parsed?.errors?.[0]?.extensions?.code;
    const hadGqlError =
      parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0;

    if (VERBOSE) {
      const tag = res.status === 200 && !hadGqlError ? 'ok' : 'err';
      // eslint-disable-next-line no-console
      console.log(
        `[survey/req] ${tag.padEnd(3)} ${String(res.status).padEnd(3)} ` +
          `${Math.round(res.timings.duration).toString().padStart(5)}ms  ` +
          `${ep.name}`
      );
    }

    if (res.status !== 200 || hadGqlError) {
      const code = classifyCode(res.status, gqlCode);
      unexpected[ep.name][code].add(1);
      logSampleOnce(ep.name, code, res.status, body, parsed, res.body);
    }
  }
}

// ----- Summary -------------------------------------------------------------

function fmtMs(n) {
  if (n == null || Number.isNaN(n)) return '   -  ';
  if (n < 10) return `${n.toFixed(1).padStart(6)}`;
  return `${Math.round(n).toString().padStart(6)}`;
}

export function handleSummary(data) {
  // Latency rows
  const rows = [];
  for (const e of ENDPOINTS) {
    const metric = data.metrics[`lat__${e.name}`];
    if (!metric) continue;
    const v = metric.values;
    if (!v.count) continue;
    rows.push({
      name: e.name,
      count: v.count || 0,
      min: v.min,
      med: v.med,
      avg: v.avg,
      p90: v['p(90)'],
      p95: v['p(95)'],
      max: v.max,
    });
  }
  rows.sort((a, b) => (b.p95 || 0) - (a.p95 || 0));

  // Unexpected-response breakdown: collect (endpoint, code) with count > 0.
  const byEndpoint = new Map();
  let totalUnexpected = 0;
  for (const e of ENDPOINTS) {
    for (const code of KNOWN_CODES) {
      const metric = data.metrics[`unexp__${e.name}__${code}`];
      const count = metric?.values?.count || 0;
      if (!count) continue;
      totalUnexpected += count;
      if (!byEndpoint.has(e.name)) byEndpoint.set(e.name, []);
      byEndpoint.get(e.name).push({ code, count });
    }
  }

  const header =
    '  endpoint                              count    min    med    avg    p90    p95    max';
  const sep =
    '  --------                              -----   ----   ----   ----   ----   ----   ----';

  const lines = [
    '',
    '=== Endpoint latency survey (ms) ===',
    `  Target:        ${API_URL}`,
    `  Iterations:    ${ITERATIONS}  (one VU, sequential)`,
    `  Include depr.: ${INCLUDE_DEPRECATED}`,
    '',
    header,
    sep,
  ];

  for (const r of rows) {
    const namePadded = r.name.padEnd(38).slice(0, 38);
    lines.push(
      `  ${namePadded} ${String(r.count).padStart(5)}  ${fmtMs(r.min)} ${fmtMs(r.med)} ${fmtMs(r.avg)} ${fmtMs(r.p90)} ${fmtMs(r.p95)} ${fmtMs(r.max)}`
    );
  }

  const skipCount = data.metrics.survey_skipped?.values?.count || 0;
  lines.push('');
  lines.push(`  Unexpected responses:  ${totalUnexpected}`);
  lines.push(`  Skipped endpoints:     ${skipCount}   (needed seed data not present in DB)`);

  if (byEndpoint.size > 0) {
    lines.push('');
    lines.push('=== Unexpected response breakdown ===');
    lines.push('  endpoint                              code                              count');
    lines.push('  --------                              ----                              -----');
    const sortedEndpoints = [...byEndpoint.entries()].sort((a, b) => {
      const sum = (xs) => xs.reduce((acc, x) => acc + x.count, 0);
      return sum(b[1]) - sum(a[1]);
    });
    for (const [endpoint, codes] of sortedEndpoints) {
      codes.sort((a, b) => b.count - a.count);
      for (const c of codes) {
        const ep = endpoint.padEnd(38).slice(0, 38);
        const cd = c.code.padEnd(34).slice(0, 34);
        lines.push(`  ${ep} ${cd}${String(c.count).padStart(5)}`);
      }
    }
  }

  lines.push('');
  lines.push('  Sorted by p95 desc — top rows are the best optimization targets.');
  lines.push('');

  return {
    stdout: lines.join('\n'),
    'results/endpoint-latency-survey.json': JSON.stringify(
      { latency: rows, unexpected: Object.fromEntries(byEndpoint) },
      null,
      2
    ),
  };
}
