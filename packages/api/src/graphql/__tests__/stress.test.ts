/**
 * GraphQL Security Stress Test
 *
 * Tests all defense layers against abusive queries.
 * Requires the API to be running on localhost:3001.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx src/graphql/__tests__/stress.test.ts
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3001/graphql';

// ── Helpers ──────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function gql(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function expectError(
  res: { status: number; body: Record<string, unknown> },
  codeLike: string
): { passed: boolean; detail: string } {
  const errors = res.body.errors as
    | Array<{ message: string; extensions?: { code?: string } }>
    | undefined;
  if (!errors || errors.length === 0) {
    return {
      passed: false,
      detail: `Expected error with code "${codeLike}" but got success (HTTP ${res.status})`,
    };
  }
  const match = errors.some(
    (e) =>
      e.extensions?.code?.includes(codeLike) ||
      e.message.toLowerCase().includes(codeLike.toLowerCase())
  );
  if (!match) {
    return {
      passed: false,
      detail: `Expected "${codeLike}", got: ${errors[0].extensions?.code ?? errors[0].message}`,
    };
  }
  return { passed: true, detail: `Blocked with: ${errors[0].message}` };
}

function expectSuccess(res: {
  status: number;
  body: Record<string, unknown>;
}): { passed: boolean; detail: string } {
  if (res.status === 200 && !res.body.errors) {
    return { passed: true, detail: 'OK' };
  }
  const errors = res.body.errors as
    | Array<{ message: string }>
    | undefined;
  return {
    passed: false,
    detail: `Expected success, got HTTP ${res.status}: ${errors?.[0]?.message ?? 'unknown error'}`,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

const tests: Array<{
  name: string;
  run: () => Promise<{ passed: boolean; detail: string }>;
}> = [];

function test(
  name: string,
  fn: () => Promise<{ passed: boolean; detail: string }>
) {
  tests.push({ name, run: fn });
}

// — 1. Legitimate queries should work —

test('Legitimate: conditions(take: 10)', async () => {
  const res = await gql('{ conditions(take: 10) { id } }');
  return expectSuccess(res);
});

test('Legitimate: categories', async () => {
  const res = await gql('{ categories { id name } }');
  return expectSuccess(res);
});

// — 2. Pagination limit (take > 100) —

test('Block: take exceeds limit (500)', async () => {
  const res = await gql('{ conditions(take: 500) { id } }');
  return expectError(res, 'PAGINATION_LIMIT_EXCEEDED');
});

test('Block: take exceeds limit (101)', async () => {
  const res = await gql('{ conditions(take: 101) { id } }');
  return expectError(res, 'PAGINATION_LIMIT_EXCEEDED');
});

test('Block: take via variable exceeds limit', async () => {
  const res = await gql(
    'query Q($t: Int!) { conditions(take: $t) { id } }',
    { t: 500 }
  );
  return expectError(res, 'PAGINATION_LIMIT_EXCEEDED');
});

// — 3. Alias limit (>3 per field) —

test('Block: 4 aliases of same field', async () => {
  const res = await gql(`{
    a1: conditions(take: 10) { id }
    a2: conditions(take: 10) { id }
    a3: conditions(take: 10) { id }
    a4: conditions(take: 10) { id }
  }`);
  return expectError(res, 'FIELD_ALIAS_LIMIT_EXCEEDED');
});

test('Allow: 3 aliases of same field (at limit)', async () => {
  const res = await gql(`{
    a1: conditions(take: 5) { id }
    a2: conditions(take: 5) { id }
    a3: conditions(take: 5) { id }
  }`);
  return expectSuccess(res);
});

// — 4. Depth limit (>5 levels) —

test('Block: query exceeding depth limit (6 levels, limit is 5)', async () => {
  const res = await gql(`{
    conditions(take: 1) {
      conditionGroup {
        conditions(take: 1) {
          conditionGroup {
            conditions(take: 1) {
              predictions(take: 1) {
                id
              }
            }
          }
        }
      }
    }
  }`);
  return expectError(res, 'GRAPHQL_VALIDATION_FAILED');
});

// — 5. Complexity limit —

test('Block: 3 expensive queries combined (complexity > 10000)', async () => {
  // protocolStats(2000) × 3 + dailyVolumes(1500) × 3 = 10500
  const res = await gql(`{
    a1: protocolStats { timestamp }
    a2: protocolStats { timestamp }
    a3: protocolStats { timestamp }
    b1: dailyVolumes { timestamp }
    b2: dailyVolumes { timestamp }
    b3: dailyVolumes { timestamp }
  }`);
  return expectError(res, 'COMPLEXITY');
});

// — 6. Payload size limit —

test('Block: oversized payload (>100kb)', async () => {
  // Create a query string that's over 100kb
  const padding = 'x'.repeat(110_000);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `{ __typename }`, padding }),
  });
  return {
    // express.json({ limit: '100kb' }) returns 413
    passed: res.status === 413,
    detail:
      res.status === 413
        ? 'Blocked with 413 Payload Too Large'
        : `Expected 413, got ${res.status}`,
  };
});

// — 7. Concurrency limiter —

test('Concurrency: burst of 10000 parallel requests', async () => {
  // Send 10k requests in parallel. With limit=15, most should get 503.
  // We verify no crashes and that the server stays responsive.
  const BURST_SIZE = 10_000;
  // Heavy query: 3 aliases of expensive SQL aggregations + nested relations
  // protocolStats(2000)×3 = 6000, conditions(~100)×3 = ~300 → total ~6300, within 10000 limit
  // Each request runs multiple heavy SQL queries, forcing concurrency limiter to kick in
  const query = `{
    ps1: protocolStats { timestamp cumulativeVolume openInterest vaultBalance }
    ps2: protocolStats { timestamp cumulativeVolume openInterest vaultBalance }
    ps3: protocolStats { timestamp cumulativeVolume openInterest vaultBalance }
    c1: conditions(take: 100) { id question endTime openInterest chainId category { id name } }
    c2: conditions(take: 100) { id question endTime openInterest chainId category { id name } }
    c3: conditions(take: 100) { id question endTime openInterest chainId category { id name } }
  }`;
  const body = JSON.stringify({ query });

  let completed = 0;
  let count200 = 0;
  let count503 = 0;
  let count429 = 0;
  let countOther = 0;
  const otherCodes = new Set<number>();
  const startTime = Date.now();

  const makeRequest = () =>
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((r) => r.status)
      .then((status) => {
        completed++;
        if (status === 200) count200++;
        else if (status === 503) count503++;
        else if (status === 429) count429++;
        else {
          countOther++;
          otherCodes.add(status);
        }

        // Progress every 1000 requests
        if (completed % 1000 === 0 || completed === BURST_SIZE) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rps = Math.round(completed / ((Date.now() - startTime) / 1000));
          process.stdout.write(
            `\r        [${completed}/${BURST_SIZE}] ${elapsed}s | ${rps} req/s | 200: ${count200} | 503: ${count503} | 429: ${count429}${countOther ? ` | other: ${countOther}` : ''}`
          );
        }
      });

  const promises = Array.from({ length: BURST_SIZE }, () => makeRequest());
  await Promise.all(promises);
  process.stdout.write('\n');

  if (countOther > 0) {
    return {
      passed: false,
      detail: `Unexpected status codes: ${JSON.stringify([...otherCodes])} (${countOther} times)`,
    };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rps = Math.round(BURST_SIZE / ((Date.now() - startTime) / 1000));
  return {
    passed: true,
    detail: `${count200} ok, ${count503} shed (503), ${count429} rate-limited (429) in ${elapsed}s (${rps} req/s). No crashes.`,
  };
});

// — 8. Rate limiter (200 req / 60s window) —

test('Rate limit: 250 requests triggers 429 after 200', async () => {
  // Default: RATE_LIMIT_MAX_REQUESTS=200 per RATE_LIMIT_WINDOW_MS=60s
  // Send 250 lightweight requests — first ~200 succeed, rest get 429
  const TOTAL = 250;
  const query = '{ __typename }';
  const body = JSON.stringify({ query });

  let completed = 0;
  let count200 = 0;
  let count429 = 0;
  let countOther = 0;
  const otherCodes = new Map<number, number>();
  const startTime = Date.now();

  const makeRequest = () =>
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((r) => r.status)
      .then((status) => {
        completed++;
        if (status === 200) count200++;
        else if (status === 429) count429++;
        else {
          countOther++;
          otherCodes.set(status, (otherCodes.get(status) ?? 0) + 1);
        }

        if (completed % 50 === 0 || completed === TOTAL) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stdout.write(
            `\r        [${completed}/${TOTAL}] ${elapsed}s | 200: ${count200} | 429: ${count429}${countOther ? ` | other: ${countOther}` : ''}`
          );
        }
      });

  const promises = Array.from({ length: TOTAL }, () => makeRequest());
  await Promise.all(promises);
  process.stdout.write('\n');

  if (count429 === 0) {
    return {
      passed: false,
      detail: `Expected some 429s after 200 requests, but all ${count200} succeeded. Is RATE_LIMIT_MAX_REQUESTS > 250?`,
    };
  }

  const otherDetail =
    countOther > 0
      ? ` | other: ${JSON.stringify(Object.fromEntries(otherCodes))}`
      : '';
  return {
    passed: true,
    detail: `${count200} ok, ${count429} rate-limited (429)${otherDetail}`,
  };
});

// — 9. Request timeout —

test('Block: introspection + expensive combo should not hang forever', async () => {
  // This should complete (blocked by complexity or succeed quickly), not hang
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          a1: protocolStats { timestamp cumulativeVolume openInterest }
          a2: protocolStats { timestamp cumulativeVolume openInterest }
          a3: protocolStats { timestamp cumulativeVolume openInterest }
        }`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      passed: res.status !== 408,
      detail: `Completed with HTTP ${res.status} (did not hang)`,
    };
  } catch {
    clearTimeout(timer);
    return { passed: false, detail: 'Request timed out or was aborted' };
  }
});

// ── Runner ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\nStress testing: ${API_URL}\n`);

  // Verify API is reachable
  try {
    await fetch(API_URL, { method: 'POST', body: '{}' });
  } catch {
    console.error('ERROR: API is not reachable. Start it first:\n');
    console.error('  pnpm run dev:api\n');
    process.exit(1);
  }

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const result = await t.run();
      results.push({ name: t.name, ...result });
      if (result.passed) {
        console.log(`  PASS  ${t.name}`);
        console.log(`        ${result.detail}`);
        passed++;
      } else {
        console.log(`  FAIL  ${t.name}`);
        console.log(`        ${result.detail}`);
        failed++;
      }
    } catch (err) {
      console.log(`  FAIL  ${t.name}`);
      console.log(`        Error: ${(err as Error).message}`);
      results.push({
        name: t.name,
        passed: false,
        detail: (err as Error).message,
      });
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${tests.length}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
