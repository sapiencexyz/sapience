#!/usr/bin/env node
/// <reference types="node" />
/**
 * Settle conditions on ConditionalTokensConditionResolver via LayerZero bridging
 *
 * Production only — bridges resolution data from Polymarket (Polygon) to Ethereal
 * mainnet via ConditionalTokensReader.requestResolution().
 *
 * 1. Queries Sapience API for unsettled conditions that have ended
 * 2. Checks if each condition is already settled on ConditionalTokensConditionResolver
 * 3. Checks if each condition is resolved on Polymarket (via ConditionalTokensReader on Polygon)
 * 4. Triggers LayerZero resolution bridging by calling requestResolution on Polygon
 *
 * Usage:
 *   tsx scripts/settle-polymarket.ts --dry-run
 *   tsx scripts/settle-polymarket.ts --execute
 *
 * Options:
 *   --dry-run      Check conditions without sending transactions (default)
 *   --execute      Actually send settlement transactions
 *   --wait         Wait for transaction confirmations
 *   --help         Show this help message
 *
 * Environment Variables (can be set in .env file):
 *   POLYGON_RPC_URL          Polygon RPC URL (required)
 *   ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
 *   SAPIENCE_API_URL         Sapience GraphQL API URL (default: https://api.sapience.xyz)
 *   RESOLVER_ADDRESS         ConditionalTokensConditionResolver address override
 *   CHAIN_ID                 Ethereal chain ID override (default: 5064014)
 */

import 'dotenv/config';

import { getConditionalTokensPairs } from '@sapience/sdk/contracts/addresses';
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  formatEther,
  defineChain,
} from 'viem';
import { batchCheckGammaResolution } from '../src/polymarket-api.js';
import {
  createPolygonClient,
  createPolygonWalletClient,
  batchCanRequestResolution,
  requestResolution as sendRequestResolution,
} from '../src/polygon/client.js';
import { fetchWithRetry } from '../src/utils/fetch.js';
import { confirmProductionAccess } from '../src/utils/index.js';

// ============ Constants ============

const RESOLVER_CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

/**
 * Reader↔Resolver pairs: each Polygon reader bridges to a specific Ethereal resolver.
 * The settlement script iterates over all pairs so legacy resolvers are also handled.
 */
interface ResolverPair {
  reader: Address;
  resolver: Address;
  label: string;
}

function getResolverPairs(): ResolverPair[] {
  const sdkPairs = getConditionalTokensPairs(RESOLVER_CHAIN_ID);
  if (sdkPairs.length === 0) {
    throw new Error(
      `No ConditionalTokens pairs configured for chain ${RESOLVER_CHAIN_ID}`
    );
  }

  return sdkPairs.map((p, i) => ({
    reader: p.reader,
    resolver: p.resolver,
    label: p.current ? 'current' : `legacy-${i}`,
  }));
}

const ETHEREAL_RPC = 'https://rpc.ethereal.trade';

// Default Sapience API URL
const DEFAULT_API_URL = 'https://api.sapience.xyz/graphql';

// ============ Chain Definition ============

const etherealChain = defineChain({
  id: RESOLVER_CHAIN_ID,
  name: 'Ethereal',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Explorer',
      url: 'https://explorer.ethereal.trade',
    },
  },
});

// ============ Types ============

interface CLIOptions {
  dryRun: boolean;
  execute: boolean;
  wait: boolean;
  help: boolean;
}

interface SapienceCondition {
  id: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ConditionsQueryResponse {
  conditionsPage: {
    items: SapienceCondition[];
    hasMore: boolean;
  };
}

interface SettlementResult {
  conditionId: string;
  alreadyResolved: boolean;
  canResolve: boolean;
  settled: boolean;
  txHash?: string;
  error?: string;
}

// ============ ABIs ============

// Resolver ABI — getResolutions (batch) to check if already settled
const resolverAbi = [
  {
    type: 'function',
    name: 'getResolutions',
    stateMutability: 'view',
    inputs: [{ name: 'conditionIds', type: 'bytes[]' }],
    outputs: [
      { name: 'resolved', type: 'bool[]' },
      {
        name: 'outcomes',
        type: 'tuple[]',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

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
Usage: tsx scripts/settle-polymarket.ts [options]

Settles conditions on ConditionalTokensConditionResolver (Ethereal mainnet) by
bridging resolution data from Polymarket on Polygon via LayerZero.

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL        Polygon RPC URL (required)
  ADMIN_PRIVATE_KEY      Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL       Sapience GraphQL API URL (default: https://api.sapience.xyz)
  RESOLVER_ADDRESS       ConditionalTokensConditionResolver address override
  CHAIN_ID               Ethereal chain ID override (default: 5064014)

Examples:
  # Dry run
  tsx scripts/settle-polymarket.ts --dry-run

  # Execute (LZ bridging)
  POLYGON_RPC_URL=https://polygon-rpc.com ADMIN_PRIVATE_KEY=0x... \\
    tsx scripts/settle-polymarket.ts --execute --wait
`);
}

// ============ GraphQL Query ============

const CONDITIONS_PAGE_SIZE = 30;

const UNRESOLVED_CONDITIONS_QUERY = `
query UnresolvedConditions($take: Int!, $skip: Int!, $resolver: String!) {
  conditionsPage(
    filters: {
      settled: false
      resolver: $resolver
      # Pick up both public and private — the deprecated resolver's
      # implicit public=true filter would silently exclude privated
      # conditions that still have engagement to settle.
      visibility: ALL
      engagement: ANY
    }
    orderBy: END_TIME
    orderDirection: asc
    take: $take
    skip: $skip
  ) {
    items {
      id
    }
    hasMore
  }
}
`;

// ============ API Functions ============

async function fetchConditionsPage(
  apiUrl: string,
  resolver: string,
  take: number,
  skip: number
): Promise<{ items: SapienceCondition[]; hasMore: boolean }> {
  const response = await fetchWithRetry(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: UNRESOLVED_CONDITIONS_QUERY,
      variables: { resolver, take, skip },
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

  return result.data?.conditionsPage ?? { items: [], hasMore: false };
}

async function fetchUnresolvedConditions(
  apiUrl: string,
  resolver: string
): Promise<SapienceCondition[]> {
  const allConditions: SapienceCondition[] = [];
  let skip = 0;

  console.log(`Fetching unresolved conditions from ${apiUrl}...`);

  while (true) {
    const page = await fetchConditionsPage(
      apiUrl,
      resolver,
      CONDITIONS_PAGE_SIZE,
      skip
    );

    allConditions.push(...page.items);

    if (page.items.length > 0) {
      console.log(`  Fetched ${allConditions.length} conditions so far...`);
    }

    if (!page.hasMore) break;

    skip += CONDITIONS_PAGE_SIZE;
  }

  console.log(`Found ${allConditions.length} unresolved conditions`);

  return allConditions;
}

// ============ Settlement Logic ============

/**
 * Check Ethereal resolver for already-settled conditions.
 * Returns a Set of condition IDs that are already settled.
 */
const BATCH_SIZE = 50;

/**
 * Batch-check Ethereal resolver for already-settled conditions using
 * the contract's native getResolutions(bytes[]) function.
 */
async function filterAlreadySettled(
  etherealClient: PublicClient,
  conditionIds: string[],
  resolverAddress: Address
): Promise<Set<string>> {
  const settled = new Set<string>();

  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE);

    try {
      const [resolvedArr] = await etherealClient.readContract({
        address: resolverAddress,
        abi: resolverAbi,
        functionName: 'getResolutions',
        args: [batch as Hex[]],
      });

      for (let j = 0; j < batch.length; j++) {
        if (resolvedArr[j]) {
          console.log(
            `[${batch[j]}] Already settled on ConditionalTokensConditionResolver`
          );
          settled.add(batch[j]);
        }
      }
    } catch (err) {
      // Batch read reverted — likely one malformed id or a transient RPC error.
      // The old per-id flow treated reverts as "not yet resolved on Ethereal"
      // and fell through to the Polygon/Gamma gate. Preserve that semantic by
      // retrying each id individually so one bad apple doesn't poison the batch.
      console.warn(
        `[batch ${i}-${i + batch.length - 1}] getResolutions reverted (${err instanceof Error ? err.message : String(err)}), falling back to per-id checks`
      );

      for (const id of batch) {
        try {
          const [isResolvedArr] = await etherealClient.readContract({
            address: resolverAddress,
            abi: resolverAbi,
            functionName: 'getResolutions',
            args: [[id] as Hex[]],
          });
          if (isResolvedArr[0]) {
            console.log(
              `[${id}] Already settled on ConditionalTokensConditionResolver`
            );
            settled.add(id);
          }
        } catch (perIdErr) {
          // Treat as not-settled. Gamma/Polygon check is the real settlement gate.
          console.log(
            `[${id}] getResolutions reverted (${perIdErr instanceof Error ? perIdErr.message : String(perIdErr)}), treating as unresolved and proceeding`
          );
        }
      }
    }
  }

  return settled;
}

/**
 * Send requestResolution for a single condition and optionally wait for confirmation.
 */
async function settleCondition(
  polygonClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account>,
  conditionId: string,
  options: CLIOptions,
  readerAddress: Address
): Promise<SettlementResult> {
  try {
    console.log(`[${conditionId}] Sending requestResolution...`);
    const hash = await sendRequestResolution(
      polygonClient,
      walletClient,
      conditionId,
      readerAddress
    );
    console.log(`[${conditionId}] Transaction sent: ${hash}`);

    if (options.wait) {
      console.log(`[${conditionId}] Waiting for confirmation...`);
      const receipt = await polygonClient.waitForTransactionReceipt({ hash });
      console.log(`[${conditionId}] Confirmed in block ${receipt.blockNumber}`);
    }

    return {
      conditionId,
      alreadyResolved: false,
      canResolve: true,
      settled: true,
      txHash: hash,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      conditionId,
      alreadyResolved: false,
      canResolve: true,
      settled: false,
      error: msg,
    };
  }
}

// ============ Per-pair processing ============

interface PairResults {
  label: string;
  total: number;
  alreadyResolved: number;
  canResolve: number;
  settled: number;
  skipped: number;
  errors: number;
}

async function processResolverPair(
  pair: ResolverPair,
  options: CLIOptions,
  sapienceApiUrl: string,
  polygonClient: PublicClient,
  etherealClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account> | null
): Promise<PairResults> {
  const results: PairResults = {
    label: pair.label,
    total: 0,
    alreadyResolved: 0,
    canResolve: 0,
    settled: 0,
    skipped: 0,
    errors: 0,
  };

  const conditions = await fetchUnresolvedConditions(
    sapienceApiUrl,
    pair.resolver
  );
  results.total = conditions.length;

  if (conditions.length === 0) {
    console.log('No unsettled conditions for this resolver');
    return results;
  }

  console.log(
    `Processing ${conditions.length} conditions (mode: ${options.dryRun ? 'dry-run' : 'execute'})`
  );

  const allIds = conditions.map((c) => c.id);

  // Step 1: Filter out already-settled on Ethereal
  const alreadySettled = await filterAlreadySettled(
    etherealClient,
    allIds,
    pair.resolver
  );
  results.alreadyResolved = alreadySettled.size;
  const unsettledIds = allIds.filter((id) => !alreadySettled.has(id));

  if (unsettledIds.length === 0) {
    console.log('All conditions already settled on resolver');
    return results;
  }

  // Step 2: Check Gamma API (free, no RPC)
  console.log(`Checking Gamma API for ${unsettledIds.length} conditions...`);
  const gamma = await batchCheckGammaResolution(unsettledIds);

  const toSettle: string[] = [];

  // Log Gamma classifications (hint only — RPC is truth for settle)
  for (const id of unsettledIds) {
    const status = gamma.statuses.get(id) ?? 'not_found';
    console.log(`[${id}] Gamma: ${status}`);
  }

  // Step 3: Batch on-chain check via multicall for ALL unsettled conditions.
  // Gamma is a classification hint, not authority over whether to burn POL.
  // Every condition must pass canRequestResolution before we send requestResolution.
  console.log(
    `Checking ${unsettledIds.length} conditions on-chain via multicall...`
  );
  try {
    const onChainResults = await batchCanRequestResolution(
      polygonClient,
      unsettledIds,
      50,
      pair.reader
    );

    for (const [id, canResolve] of onChainResults) {
      console.log(`[${id}] canRequestResolution = ${canResolve}`);
      if (canResolve) {
        console.log(
          `[${id}] ${options.dryRun ? 'DRY RUN — would send requestResolution' : 'will send requestResolution'}`
        );
        toSettle.push(id);
        results.canResolve++;
      } else {
        results.skipped++;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Multicall error: ${msg}`);
    results.errors += unsettledIds.length;
  }

  // Step 4: Send requestResolution for all resolved conditions
  if (toSettle.length > 0 && options.execute && walletClient) {
    for (const id of toSettle) {
      const result = await settleCondition(
        polygonClient,
        walletClient,
        id,
        options,
        pair.reader
      );
      if (result.settled) {
        results.settled++;
      } else if (result.error) {
        console.error(`[${id}] Settlement error: ${result.error}`);
        results.errors++;
      }
    }
  } else if (toSettle.length > 0 && options.execute && !walletClient) {
    console.error('No wallet client (missing ADMIN_PRIVATE_KEY)');
    results.errors += toSettle.length;
  }

  return results;
}

// ============ Main ============

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  let sapienceApiUrl: string;
  if (process.env.SAPIENCE_API_URL) {
    sapienceApiUrl = process.env.SAPIENCE_API_URL + '/graphql';
  } else {
    sapienceApiUrl = DEFAULT_API_URL;
  }

  if (!polygonRpcUrl) {
    console.error('POLYGON_RPC_URL environment variable is required');
    process.exit(1);
  }

  if (options.execute && !privateKey) {
    console.error(
      'ADMIN_PRIVATE_KEY environment variable is required for --execute mode'
    );
    process.exit(1);
  }

  // Confirm production access if pointing to production
  await confirmProductionAccess(process.env.SAPIENCE_API_URL);

  const pairs = getResolverPairs();

  // Polygon client — read ConditionalTokensReader
  const polygonClient = createPolygonClient(polygonRpcUrl);

  // Ethereal client — read resolver state
  const etherealClient = createPublicClient({
    chain: etherealChain,
    transport: http(ETHEREAL_RPC),
  });

  console.log(
    `Ethereal client connected (chain ${RESOLVER_CHAIN_ID}, ${pairs.length} resolver pair(s))`
  );

  // Wallet on Polygon for requestResolution (LZ bridging)
  let walletClient: WalletClient<Transport, Chain, Account> | null = null;

  if (privateKey) {
    walletClient = createPolygonWalletClient(polygonRpcUrl, privateKey);

    const balance = await polygonClient.getBalance({
      address: walletClient.account.address,
    });
    console.log(
      `Wallet ${walletClient.account.address} balance: ${formatEther(balance)} POL (Polygon)`
    );
  }

  try {
    const allResults: PairResults[] = [];

    for (const pair of pairs) {
      console.log(`\n=== Resolver pair: ${pair.label} ===`);
      console.log(`  Reader (Polygon):   ${pair.reader}`);
      console.log(`  Resolver (Ethereal): ${pair.resolver}`);

      const results = await processResolverPair(
        pair,
        options,
        sapienceApiUrl,
        polygonClient,
        etherealClient,
        walletClient
      );
      allResults.push(results);
    }

    // Summary
    console.log('\n--- Summary ---');
    for (const r of allResults) {
      if (r.total === 0) {
        console.log(`[${r.label}] No conditions`);
        continue;
      }
      console.log(
        `[${r.label}] Total: ${r.total}, Already resolved: ${r.alreadyResolved}, Can resolve: ${r.canResolve}, Settled: ${r.settled}, Skipped: ${r.skipped}, Errors: ${r.errors}`
      );
    }

    const totals = allResults.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        alreadyResolved: acc.alreadyResolved + r.alreadyResolved,
        canResolve: acc.canResolve + r.canResolve,
        settled: acc.settled + r.settled,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors,
      }),
      {
        total: 0,
        alreadyResolved: 0,
        canResolve: 0,
        settled: 0,
        skipped: 0,
        errors: 0,
      }
    );

    console.log(`\nTotal across all pairs:`);
    console.log(`  Conditions:          ${totals.total}`);
    console.log(`  Already on resolver: ${totals.alreadyResolved}`);
    console.log(`  Resolved on Polygon: ${totals.canResolve}`);
    console.log(`  Settled (tx sent):   ${totals.settled}`);
    console.log(`  Skipped:             ${totals.skipped}`);
    console.log(`  Errors:              ${totals.errors}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:settle-polymarket', 'START');
main().finally(() => logSeparator('market-keeper:settle-polymarket', 'END'));
