/**
 * Integrator query benchmark — replays the 15 queries from
 * /Users/zayd/Downloads/sapience-all-queries.graphql against a configurable
 * GraphQL endpoint to capture p50/p95/p99 of `durationMs` per operation.
 *
 * NOT committed to the repo by default — this is scaffolding for the
 * post-PR-1 staging baseline. If we end up running it across phases, it
 * earns its own PR; otherwise, it's a one-shot.
 *
 * Usage:
 *   npx tsx packages/benchmarks/scripts/integrator-suite.ts
 *
 * Override:
 *   ENDPOINT=https://api.staging.sapience.xyz/graphql ITERATIONS=20 npx tsx ...
 */

import { performance } from 'node:perf_hooks';

const ENDPOINT =
  process.env.ENDPOINT ?? 'https://api.staging.sapience.xyz/graphql';
const ITERATIONS = Number(process.env.ITERATIONS ?? '20');
const SLEEP_MS = Number(process.env.SLEEP_MS ?? '50');
const WARMUP = 1;

// ---- Reused values --------------------------------------------------------

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const CHAIN_ID = 8453; // Base

// Real condition IDs harvested from staging logs on 2026-04-27 — using these
// so GetPredictionMarketsByIds does actual lookup work, not an empty query.
const KNOWN_CONDITION_IDS = [
  '0x029505ba7fa2ba0fd5190c6add81dbffba8832e2301f2e45a5be9f4aa081f5f0',
  '0x2ded6bee422daba3a00f8c29d96aeb3e1840b5608f3598012008da27910a54eb',
  '0x3866ca78885e658de7de3510edbdea140b68f58a81fccdc1dac1531a9292cae3',
];

// ---- Shared fragments (inlined into queries below) -----------------------

const CATEGORY_FIELDS = `
  fragment CategoryFields on Category {
    id
    name
    slug
  }
`;

const CONDITION_FIELDS = `
  fragment ConditionFields on Condition {
    id resolver createdAt question shortName optionName endTime public
    description chainId settled resolvedToYes estimatedPrice openInterest
    similarMarketVolume similarMarketImage conditionGroupId similarMarkets
    displayOrder
    category { ...CategoryFields }
  }
`;

const CONDITION_GROUP_FIELDS = `
  fragment ConditionGroupFields on ConditionGroup {
    id createdAt name similarMarkets
    category { ...CategoryFields }
    conditions(where: { settled: { equals: false } }) {
      ...ConditionFields
    }
  }
`;

const CONDITION_GROUP_WITH_ALL_CONDITIONS_FIELDS = `
  fragment ConditionGroupWithAllConditionsFields on ConditionGroup {
    id createdAt name similarMarkets
    category { ...CategoryFields }
    conditions { ...ConditionFields }
  }
`;

const PICK_CONFIG_FIELDS = `
  pickConfig {
    id marketAddress endsAt resolved result
    totalPredictorCollateral totalCounterpartyCollateral
    picks { conditionId predictedOutcome }
  }
`;

const FRAGMENTS_BASE = `${CATEGORY_FIELDS}\n${CONDITION_FIELDS}`;
const FRAGMENTS_GROUPS = `${FRAGMENTS_BASE}\n${CONDITION_GROUP_FIELDS}\n${CONDITION_GROUP_WITH_ALL_CONDITIONS_FIELDS}`;

// ---- The 15 integrator queries -------------------------------------------

interface Probe {
  name: string;
  query: string;
  variables?: Record<string, unknown>;
}

const probes: Probe[] = [
  {
    name: 'GetAccountBalance',
    query: `
      query GetAccountBalance($address: String!, $interval: TimeInterval!) {
        accountBalance(address: $address, interval: $interval) {
          timestamp
          deployedCollateral
          claimableCollateral
        }
      }
    `,
    variables: { address: ZERO_ADDR, interval: 'DAY' },
  },
  {
    name: 'GetAccountPnl',
    query: `
      query GetAccountPnl($address: String!, $interval: TimeInterval!) {
        accountPnl(address: $address, interval: $interval) {
          timestamp
          pnl
          cumulativePnl
        }
      }
    `,
    variables: { address: ZERO_ADDR, interval: 'DAY' },
  },
  {
    name: 'GetAccountPredictionCount',
    query: `
      query GetAccountPredictionCount($address: String!, $interval: TimeInterval!) {
        accountPredictionCount(address: $address, interval: $interval) {
          timestamp
          total
          won
          lost
          pending
          nonDecisive
        }
      }
    `,
    variables: { address: ZERO_ADDR, interval: 'DAY' },
  },
  {
    name: 'GetAccountVolume',
    query: `
      query GetAccountVolume($address: String!, $interval: TimeInterval!) {
        accountVolume(address: $address, interval: $interval) {
          timestamp
          volume
        }
      }
    `,
    variables: { address: ZERO_ADDR, interval: 'DAY' },
  },
  {
    name: 'GetAccountTotalVolume',
    query: `
      query GetAccountTotalVolume($address: String!) {
        accountTotalVolume(address: $address)
      }
    `,
    variables: { address: ZERO_ADDR },
  },
  {
    name: 'GetCategories',
    query: `
      ${CATEGORY_FIELDS}
      query GetCategories {
        categories { ...CategoryFields }
      }
    `,
  },
  {
    name: 'GetPopularTags',
    query: `
      query GetPopularTags { popularTags }
    `,
  },
  {
    name: 'GetCollateralBalance',
    query: `
      query GetCollateralBalance($address: String!, $chainId: Int!) {
        collateralBalance(address: $address, chainId: $chainId) {
          balance
        }
      }
    `,
    variables: { address: ZERO_ADDR, chainId: CHAIN_ID },
  },
  {
    name: 'GetCollateralBalanceHistory',
    query: `
      query GetCollateralBalanceHistory($address: String!, $chainId: Int!) {
        collateralBalanceHistory(address: $address, chainId: $chainId) {
          index
          timestamp
          balance
        }
      }
    `,
    variables: { address: ZERO_ADDR, chainId: CHAIN_ID },
  },
  {
    name: 'GetPositionCount',
    query: `
      query GetPositionCount($holder: String!) {
        positionCount(holder: $holder)
      }
    `,
    variables: { holder: ZERO_ADDR },
  },
  {
    name: 'GetPositions',
    query: `
      query GetPositions($skip: Int!, $take: Int!) {
        positions(skip: $skip, take: $take) {
          id chainId createdAt holder isPredictorToken balance
          tokenAddress pickConfigId userCollateral totalPayout
          ${PICK_CONFIG_FIELDS}
        }
      }
    `,
    variables: { skip: 0, take: 20 },
  },
  {
    name: 'GetPredictions',
    query: `
      query GetPredictions($skip: Int!, $take: Int!) {
        predictions(skip: $skip, take: $take) {
          id predictionId chainId marketAddress predictor counterparty
          predictorCollateral counterpartyCollateral settled result createdAt
          ${PICK_CONFIG_FIELDS}
        }
      }
    `,
    variables: { skip: 0, take: 20 },
  },
  {
    name: 'GetQuestionsSorted',
    query: `
      ${FRAGMENTS_BASE}
      query GetQuestionsSorted(
        $take: Int!
        $skip: Int!
        $sortField: QuestionSortField
        $sortDirection: SortOrder!
      ) {
        questionsSorted: questions(
          take: $take
          skip: $skip
          sortField: $sortField
          sortDirection: $sortDirection
        ) {
          questionType
          group {
            id createdAt name similarMarkets
            category { ...CategoryFields }
            conditions { ...ConditionFields }
          }
          condition { ...ConditionFields }
        }
      }
    `,
    variables: {
      take: 20,
      skip: 0,
      sortField: 'similarMarketVolume',
      sortDirection: 'desc',
    },
  },
  {
    name: 'GetPredictionMarketsByIds',
    query: `
      ${FRAGMENTS_BASE}
      query GetPredictionMarketsByIds(
        $conditionIds: [String!]
        $conditionsTake: Int
      ) {
        conditions(take: $conditionsTake, where: { id: { in: $conditionIds } }) {
          ...ConditionFields
        }
      }
    `,
    variables: {
      conditionIds: KNOWN_CONDITION_IDS,
      conditionsTake: 10,
    },
  },
  {
    name: 'GetTradesBySeller',
    query: `
      query GetTradesBySeller($seller: String!) {
        trades(seller: $seller) {
          id tradeHash chainId token collateral seller buyer
          tokenAmount price txHash blockNumber executedAt
        }
      }
    `,
    variables: { seller: ZERO_ADDR },
  },
];

// ---- Runner --------------------------------------------------------------

interface SampleResult {
  ms: number;
  ok: boolean;
  status: number;
  errMsg?: string;
}

async function runOnce(probe: Probe): Promise<SampleResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apollographql-client-name': 'integrator-benchmark',
      },
      body: JSON.stringify({
        operationName: probe.name,
        query: probe.query,
        variables: probe.variables ?? {},
      }),
    });
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    let ok = res.status === 200;
    let errMsg: string | undefined;
    if (!ok) {
      // Non-200: record the status + first chunk of body so 429s, 500s,
      // and other HTTP-level failures don't show up as silent "" errors.
      errMsg = `HTTP ${res.status}: ${text.slice(0, 100)}`;
    } else if (text.includes('"errors"')) {
      ok = false;
      try {
        const parsed = JSON.parse(text);
        errMsg = parsed?.errors?.[0]?.message ?? 'unknown gql error';
      } catch {
        errMsg = 'unparseable error body';
      }
    }
    return { ms, ok, status: res.status, errMsg };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    const errMsg = err instanceof Error ? err.message : String(err);
    return { ms, ok: false, status: 0, errMsg };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
};

interface Summary {
  name: string;
  n: number;
  ok: number;
  errSample?: string;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

async function benchmarkProbe(probe: Probe): Promise<Summary> {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await runOnce(probe);
    await sleep(SLEEP_MS);
  }
  // Measure
  const samples: SampleResult[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    samples.push(await runOnce(probe));
    await sleep(SLEEP_MS);
  }
  const durations = samples.map((s) => s.ms).sort((a, b) => a - b);
  const okCount = samples.filter((s) => s.ok).length;
  const errSample = samples.find((s) => !s.ok)?.errMsg;
  return {
    name: probe.name,
    n: samples.length,
    ok: okCount,
    errSample,
    min: durations[0] ?? 0,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations[durations.length - 1] ?? 0,
  };
}

async function main(): Promise<void> {
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(
    `Iterations: ${ITERATIONS} per query (+${WARMUP} warmup), ${SLEEP_MS}ms sleep between requests`
  );
  console.log(
    `Total requests: ${(ITERATIONS + WARMUP) * probes.length}\n`
  );

  const summaries: Summary[] = [];
  for (let i = 0; i < probes.length; i++) {
    const probe = probes[i];
    process.stdout.write(`[${i + 1}/${probes.length}] ${probe.name}… `);
    const t0 = performance.now();
    const summary = await benchmarkProbe(probe);
    const elapsed = Math.round(performance.now() - t0);
    summaries.push(summary);
    const errNote = summary.ok < summary.n
      ? ` (${summary.n - summary.ok} errors: "${(summary.errSample ?? '').slice(0, 80)}")`
      : '';
    console.log(
      `done in ${elapsed}ms — ok=${summary.ok}/${summary.n} p50=${summary.p50}ms p95=${summary.p95}ms${errNote}`
    );
  }

  // Print sorted-by-p95 markdown table
  summaries.sort((a, b) => b.p95 - a.p95);
  console.log('\n\n=== Markdown table (sorted by p95 desc) ===\n');
  console.log('| Operation | ok/n | min | p50 | p95 | p99 | max | first error |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const s of summaries) {
    const err = s.ok === s.n ? '' : (s.errSample ?? '?').slice(0, 60);
    console.log(
      `| \`${s.name}\` | ${s.ok}/${s.n} | ${s.min}ms | ${s.p50}ms | ${s.p95}ms | ${s.p99}ms | ${s.max}ms | ${err} |`
    );
  }
}

void main();
