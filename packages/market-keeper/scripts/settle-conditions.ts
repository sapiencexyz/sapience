#!/usr/bin/env node
/// <reference types="node" />
/**
 * Unified condition settlement script.
 *
 * Fetches all unsettled conditions from the Sapience API, classifies each by
 * resolver type (CT or Pyth), and dispatches to the appropriate handler.
 *
 * Replaces the separate settle-polymarket.ts and settle-pyth.ts scripts.
 *
 * Usage:
 *   tsx scripts/settle-conditions.ts --dry-run
 *   tsx scripts/settle-conditions.ts --execute
 *   tsx scripts/settle-conditions.ts --execute --wait
 *
 * Options:
 *   --dry-run      Check conditions without sending transactions (default)
 *   --execute      Actually send settlement transactions
 *   --wait         Wait for transaction confirmations
 *   --help         Show this help message
 *
 * Environment Variables (can be set in .env file):
 *   POLYGON_RPC_URL          Polygon RPC URL (required for CT settlement)
 *   ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
 *   SAPIENCE_API_URL         Sapience GraphQL API URL (default: https://api.sapience.xyz)
 *   CHAIN_ID                 Ethereal chain ID override (default: 5064014)
 *   PYTH_CONSUMER_TOKEN      Pyth Lazer API bearer token (required for Pyth settlement)
 *   PYTH_BASE_URL            Pyth Lazer API base URL (default: https://pyth-lazer.dourolabs.app)
 *   RESOLVER_ADDRESS         ConditionalTokensConditionResolver address override
 *   PYTH_RESOLVER_ADDRESS    PythConditionResolver address override
 */

import 'dotenv/config';

import { fetchWithRetry } from '../src/utils/fetch.js';
import { confirmProductionAccess } from '../src/utils/index.js';
import { logSeparator } from '../src/utils/log.js';
import {
  CTSettlementHandler,
  PythSettlementHandler,
  buildResolverClassifier,
  type CLIOptions,
  type ResolverType,
  type SapienceCondition,
  type SettlementHandler,
} from '../src/settlement/index.js';

// ============ Constants ============

const CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');
const DEFAULT_API_URL = 'https://api.sapience.xyz/graphql';
const CONDITIONS_PAGE_SIZE = 30;

// ============ CLI Arguments ============

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const hasArg = (name: string): boolean =>
    args.includes(`--${name}`) || args.some((a) => a.startsWith(`--${name}=`));

  return {
    dryRun: hasArg('dry-run') || !hasArg('execute'),
    execute: hasArg('execute'),
    wait: hasArg('wait'),
    help: hasArg('help') || hasArg('h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/settle-conditions.ts [options]

Settles all unsettled conditions by dispatching to the appropriate resolver handler:
  - CT conditions → bridge from Polymarket on Polygon via LayerZero
  - Pyth conditions → settle directly with Pyth Lazer price data

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL        Polygon RPC URL (required for CT settlement)
  ADMIN_PRIVATE_KEY      Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL       Sapience GraphQL API URL (default: https://api.sapience.xyz)
  CHAIN_ID               Ethereal chain ID override (default: 5064014)
  PYTH_CONSUMER_TOKEN    Pyth Lazer API bearer token (required for Pyth settlement)
  PYTH_BASE_URL          Pyth Lazer API base URL
  RESOLVER_ADDRESS       ConditionalTokensConditionResolver address override
  PYTH_RESOLVER_ADDRESS  PythConditionResolver address override

Examples:
  # Dry run (all resolvers)
  tsx scripts/settle-conditions.ts --dry-run

  # Execute with wait
  POLYGON_RPC_URL=https://polygon-rpc.com PYTH_CONSUMER_TOKEN=tok \\
    ADMIN_PRIVATE_KEY=0x... tsx scripts/settle-conditions.ts --execute --wait
`);
}

// ============ GraphQL ============

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ConditionsQueryResponse {
  conditions: SapienceCondition[];
}

const UNRESOLVED_CONDITIONS_QUERY = `
query UnresolvedConditions($now: Int!, $take: Int!, $skip: Int!) {
  conditions(
    where: {
      AND: [
        { endTime: { lt: $now } }
        { settled: { equals: false } }
        { public: { equals: true } }
        {
          OR: [
            { openInterest: { gt: "0" } }
            { attestations: { some: {} } }
          ]
        }
      ]
    }
    orderBy: { endTime: asc }
    take: $take
    skip: $skip
  ) {
    id
    resolver
  }
}
`;

async function fetchConditionsPage(
  apiUrl: string,
  nowTimestamp: number,
  take: number,
  skip: number
): Promise<SapienceCondition[]> {
  const response = await fetchWithRetry(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: UNRESOLVED_CONDITIONS_QUERY,
      variables: { now: nowTimestamp, take, skip },
    }),
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '(could not read response body)';
    }
    throw new Error(
      `GraphQL request failed: ${response.status} ${response.statusText}\n` +
        `URL: ${apiUrl}\n` +
        `Response: ${errorBody.slice(0, 500)}`
    );
  }

  let result: GraphQLResponse<ConditionsQueryResponse>;
  try {
    result =
      (await response.json()) as GraphQLResponse<ConditionsQueryResponse>;
  } catch {
    const text = await response
      .clone()
      .text()
      .catch(() => '(could not read body)');
    throw new Error(
      `Failed to parse GraphQL response as JSON\n` +
        `URL: ${apiUrl}\n` +
        `Response: ${text.slice(0, 500)}`
    );
  }

  if (result.errors?.length) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`
    );
  }

  return result.data?.conditions ?? [];
}

async function fetchUnresolvedConditions(
  apiUrl: string
): Promise<SapienceCondition[]> {
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const allConditions: SapienceCondition[] = [];
  let skip = 0;

  console.log(`Fetching unresolved conditions from ${apiUrl}...`);

  while (true) {
    const page = await fetchConditionsPage(
      apiUrl,
      nowTimestamp,
      CONDITIONS_PAGE_SIZE + 1,
      skip
    );

    const hasMore = page.length > CONDITIONS_PAGE_SIZE;
    const pageConditions = hasMore ? page.slice(0, CONDITIONS_PAGE_SIZE) : page;

    allConditions.push(...pageConditions);

    if (pageConditions.length > 0) {
      console.log(`  Fetched ${allConditions.length} conditions so far...`);
    }

    if (!hasMore) break;

    skip += CONDITIONS_PAGE_SIZE;
  }

  console.log(`Found ${allConditions.length} unresolved conditions`);

  return allConditions;
}

// ============ Main ============

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  let sapienceApiUrl: string;
  if (process.env.SAPIENCE_API_URL) {
    const base = process.env.SAPIENCE_API_URL.replace(/\/graphql\/?$/, '');
    sapienceApiUrl = base + '/graphql';
  } else {
    sapienceApiUrl = DEFAULT_API_URL;
  }

  if (options.execute && !privateKey) {
    console.error(
      'ADMIN_PRIVATE_KEY environment variable is required for --execute mode'
    );
    process.exit(1);
  }

  // Confirm production access if pointing to production
  await confirmProductionAccess(process.env.SAPIENCE_API_URL);

  // Build resolver classifier from SDK address maps
  const classifyResolver = buildResolverClassifier(CHAIN_ID);

  // Initialize handlers (only those with required config)
  const handlers: Record<string, SettlementHandler> = {};

  const ctHandler = new CTSettlementHandler();
  if (ctHandler.isConfigured()) {
    await ctHandler.init(options);
    handlers['ct'] = ctHandler;
  }

  const pythHandler = new PythSettlementHandler();
  if (pythHandler.isConfigured()) {
    await pythHandler.init(options);
    handlers['pyth'] = pythHandler;
  }

  if (Object.keys(handlers).length === 0) {
    console.error('No settlement handlers configured. Check environment variables.');
    process.exit(1);
  }

  console.log(
    `Active handlers: ${Object.keys(handlers).join(', ')} (mode: ${options.dryRun ? 'dry-run' : 'execute'})`
  );

  // Fetch all unsettled conditions
  const conditions = await fetchUnresolvedConditions(sapienceApiUrl);

  if (conditions.length === 0) {
    console.log('No unsettled conditions found');
    return;
  }

  // Classify and dispatch
  const results = {
    total: conditions.length,
    byType: {} as Record<string, {
      total: number;
      alreadyResolved: number;
      canResolve: number;
      settled: number;
      skipped: number;
      errors: number;
    }>,
    unknownResolver: 0,
    noHandler: 0,
  };

  const initBucket = (type: string) => {
    if (!results.byType[type]) {
      results.byType[type] = {
        total: 0,
        alreadyResolved: 0,
        canResolve: 0,
        settled: 0,
        skipped: 0,
        errors: 0,
      };
    }
    return results.byType[type]!;
  };

  for (const condition of conditions) {
    const resolverType = classifyResolver(condition.resolver);

    if (resolverType === 'unknown') {
      console.warn(
        `[${condition.id.slice(0, 18)}...] Unknown resolver: ${condition.resolver ?? 'null'}, skipping`
      );
      results.unknownResolver++;
      continue;
    }

    const handler = handlers[resolverType];
    if (!handler) {
      console.log(
        `[${condition.id.slice(0, 18)}...] ${resolverType} handler not configured, skipping`
      );
      results.noHandler++;
      continue;
    }

    const bucket = initBucket(resolverType);
    bucket.total++;

    const result = await handler.settle(condition, options);

    if (result.alreadyResolved) {
      bucket.alreadyResolved++;
    } else if (result.error) {
      console.error(
        `[${resolverType}] Error for ${condition.id.slice(0, 18)}...: ${result.error}`
      );
      bucket.errors++;
    } else if (!result.canResolve) {
      bucket.skipped++;
    } else {
      bucket.canResolve++;
      if (result.settled) bucket.settled++;
    }
  }

  // Summary
  console.log('\n--- Settlement Summary ---');
  console.log(`Total conditions:    ${results.total}`);
  console.log(`Unknown resolver:    ${results.unknownResolver}`);
  console.log(`No handler:          ${results.noHandler}`);

  for (const [type, stats] of Object.entries(results.byType)) {
    console.log(`\n  [${type}]`);
    console.log(`  Total:             ${stats.total}`);
    console.log(`  Already resolved:  ${stats.alreadyResolved}`);
    console.log(`  Can resolve:       ${stats.canResolve}`);
    console.log(`  Settled (tx sent): ${stats.settled}`);
    console.log(`  Skipped:           ${stats.skipped}`);
    console.log(`  Errors:            ${stats.errors}`);
  }
}

// Run
logSeparator('market-keeper:settle-conditions', 'START');
main()
  .catch((e) => {
    console.error('[settle-conditions] fatal:', e);
    process.exitCode = 1;
  })
  .finally(() => logSeparator('market-keeper:settle-conditions', 'END'));
