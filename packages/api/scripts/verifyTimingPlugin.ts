/**
 * Local verification script for operationTimingPlugin.
 *
 * Sends a representative set of GraphQL requests against a running API
 * server (default: http://localhost:3001/graphql) so you can eyeball the
 * structured log lines that operationTimingPlugin emits to stdout.
 *
 * Why this exists: shell-quoting JSON for curl is fragile (every
 * terminal/paste/continuation is a place for a quote to die). Building
 * request bodies as JS objects and POSTing via fetch sidesteps the
 * problem entirely.
 *
 * Usage:
 *   1. Start the API in one terminal:
 *        pnpm --filter @sapience/api run dev
 *   2. Run this script in another:
 *        tsx packages/api/scripts/verifyTimingPlugin.ts
 *
 * Override the endpoint:
 *   ENDPOINT=http://localhost:3001/graphql tsx packages/api/scripts/verifyTimingPlugin.ts
 *
 * What to look for: each probe prints what strings should appear in the
 * server's stdout log line for that request. Resolvers may error if the
 * local DB isn't connected — that's fine, the plugin still logs and
 * sanitization still applies. The eyeball check is on the variables.
 */

interface Probe {
  label: string;
  expects: string[];
  body: {
    operationName?: string;
    query: string;
    variables?: Record<string, unknown>;
  };
}

const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:3001/graphql';

const probes: Probe[] = [
  {
    label: 'sensitive-var redaction (address)',
    expects: ['"address":"[REDACTED]"'],
    body: {
      operationName: 'GetAccountStatsRank',
      query: `query GetAccountStatsRank($address: String!, $filters: AccountStatsFilters!) {
        accountStatsRank(address: $address, filters: $filters) {
          rank
          totalParticipants
        }
      }`,
      variables: {
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bAce',
        filters: { metric: 'NET_PNL' },
      },
    },
  },
  {
    label: 'sensitive-var redaction (holder) + non-sensitive pass-through (chainId)',
    expects: ['"holder":"[REDACTED]"', '"chainId":8453'],
    body: {
      operationName: 'GetPositionCount',
      query: `query GetPositionCount($holder: String!, $chainId: Int) {
        positionCount(holder: $holder, chainId: $chainId)
      }`,
      variables: {
        holder: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 8453,
      },
    },
  },
  {
    label: 'no variables → empty variables object in log',
    expects: ['"variables":{}', '"operationName":"GetCategories"'],
    body: {
      operationName: 'GetCategories',
      query: `query GetCategories { categories { id name slug } }`,
    },
  },
  {
    label: 'pagination + sort args pass through unredacted',
    expects: ['"take":5', '"skip":0', '"sortDirection":"desc"'],
    body: {
      operationName: 'GetQuestionsSorted',
      query: `query GetQuestionsSorted($take: Int!, $skip: Int!, $sortDirection: SortOrder!) {
        questions(take: $take, skip: $skip, sortDirection: $sortDirection) {
          questionType
        }
      }`,
      variables: {
        take: 5,
        skip: 0,
        sortDirection: 'desc',
      },
    },
  },
  {
    label: 'complexity bridge populated by the existing complexity plugin',
    expects: ['"complexity":'],
    body: {
      operationName: 'GetPopularTags',
      query: `query GetPopularTags { popularTags }`,
    },
  },
  {
    label: 'anonymous query → operationName falls back to "anonymous"',
    expects: ['"operationName":"anonymous"'],
    body: {
      query: `{ __typename }`,
    },
  },
  {
    label: 'invalid field → errors > 0, plugin still logs',
    expects: ['"errors":', '"operationName":"BadQuery"'],
    body: {
      operationName: 'BadQuery',
      query: `query BadQuery { thisFieldDoesNotExistOnQuery }`,
    },
  },
];

const truncate = (s: string, max = 250): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

async function runProbe(probe: Probe, index: number): Promise<void> {
  const requestId = `verify-${String(index + 1).padStart(2, '0')}`;
  console.log(`\n── [${index + 1}/${probes.length}] ${probe.label}`);
  console.log(`   X-Request-ID: ${requestId}`);
  console.log(`   Server log should contain:`);
  for (const expected of probe.expects) {
    console.log(`     ✓ ${expected}`);
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'apollographql-client-name': 'verify-timing-plugin',
      },
      body: JSON.stringify(probe.body),
    });
    const text = await res.text();
    console.log(`   HTTP ${res.status} → ${truncate(text)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`   FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Running ${probes.length} probes…`);
  for (let i = 0; i < probes.length; i++) {
    await runProbe(probes[i], i);
  }
  console.log(
    `\nDone. Scan the API server's stdout for the JSON lines that begin with` +
      ` {"event":"gql_request" and confirm the strings shown above.`
  );
  console.log(
    `Tip: pipe the server's stdout through ` +
      `\`grep '"event":"gql_request"' | jq -c '.'\` for clean output.`
  );
}

void main();
