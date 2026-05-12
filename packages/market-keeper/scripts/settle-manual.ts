#!/usr/bin/env node
/// <reference types="node" />
/**
 * Settle conditions on ManualConditionResolver (staging/testnet only)
 *
 * This script:
 * 1. Queries Sapience API for unsettled conditions that have ended
 * 2. Checks if each condition is already settled on ManualConditionResolver
 * 3. Checks if each condition is resolved on Polymarket (via ConditionalTokensReader on Polygon)
 * 4. Falls back to Polymarket REST APIs for voided/closed markets
 * 5. Writes outcomes to ManualConditionResolver via settleConditions() (batch)
 *
 * Staging only — refuses to run if RESOLVER_ADDRESS doesn't match ManualConditionResolver.
 *
 * Usage:
 *   tsx scripts/settle-manual.ts --dry-run
 *   tsx scripts/settle-manual.ts --execute
 *
 * Options:
 *   --dry-run      Check conditions without sending transactions (default)
 *   --execute      Actually send settlement transactions
 *   --wait         Wait for transaction confirmations
 *   --help         Show this help message
 *
 * Environment Variables (can be set in .env file):
 *   POLYGON_RPC_URL        Polygon RPC URL (required)
 *   ADMIN_PRIVATE_KEY      Private key for signing transactions (required for --execute)
 *   SAPIENCE_API_URL       Sapience GraphQL API URL (default: https://api.sapience.xyz)
 *   RESOLVER_ADDRESS       ManualConditionResolver address override
 *   CHAIN_ID               Ethereal chain ID override (default: 13374202)
 */

import 'dotenv/config';

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  type Address,
  type Hex,
  type Account,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { fetchWithRetry } from '../src/utils/fetch.js';
import { logSeparator } from '../src/utils/log.js';
import {
  manualConditionResolver,
  conditionalTokensReader,
  normalizeLegacyEntry,
} from '@sapience/sdk/contracts/addresses';
import {
  determineOutcomeFromPolymarket,
  outcomeToString,
  manualConditionResolverAbi,
  type OutcomeVector,
} from '../src/manual.js';

// ============ Constants ============

const CHAIN_ID = Number(process.env.CHAIN_ID || '13374202');

/**
 * Get all manual resolver addresses for the configured chain (current + legacy).
 */
function getManualResolverAddresses(): { address: Address; label: string }[] {
  const config = manualConditionResolver[CHAIN_ID];
  if (!config) {
    throw new Error(
      `No ManualConditionResolver configured for chain ${CHAIN_ID}`
    );
  }

  const addresses: { address: Address; label: string }[] = [
    { address: config.address as Address, label: 'current' },
  ];

  for (const legEntry of config.legacy ?? []) {
    const { address } = normalizeLegacyEntry(legEntry);
    addresses.push({
      address: address as Address,
      label: `legacy-${address.slice(0, 8)}`,
    });
  }

  return addresses;
}

const ETHEREAL_RPC = 'https://rpc.etherealtest.net';

const CONDITIONAL_TOKENS_READER_ADDRESS = (process.env
  .CONDITIONAL_TOKENS_READER_ADDRESS ||
  conditionalTokensReader[137]?.address) as Address;

const DEFAULT_API_URL = 'https://api.sapience.xyz/graphql';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob-v2.polymarket.com';

// ============ Chain Definition ============

const etherealTestnet = defineChain({
  id: CHAIN_ID,
  name: 'Ethereal Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_RPC] },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Testnet Explorer',
      url: 'https://explorer.etherealtest.net',
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
  question: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ConditionsQueryResponse {
  conditions: SapienceCondition[];
}

interface SettlementCandidate {
  conditionId: Hex;
  outcome: OutcomeVector;
  source: 'polygon' | 'api';
}

// ============ ABIs ============

const conditionalTokensReaderAbi = [
  {
    type: 'function',
    name: 'canRequestResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getConditionResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'slotCount', type: 'uint256' },
          { name: 'payoutDenominator', type: 'uint256' },
          { name: 'noPayout', type: 'uint256' },
          { name: 'yesPayout', type: 'uint256' },
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
Usage: tsx scripts/settle-manual.ts [options]

Settles conditions on ManualConditionResolver (staging/testnet only) by reading
resolution data from Polymarket on Polygon.

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL        Polygon RPC URL (required)
  ADMIN_PRIVATE_KEY      Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL       Sapience GraphQL API URL (default: https://api.sapience.xyz)
  RESOLVER_ADDRESS       ManualConditionResolver address override
  CHAIN_ID               Ethereal chain ID override (default: 13374202)

Examples:
  # Dry run — check which conditions can be settled
  tsx scripts/settle-manual.ts --dry-run

  # Execute settlements
  POLYGON_RPC_URL=https://polygon-rpc.com ADMIN_PRIVATE_KEY=0x... \\
    tsx scripts/settle-manual.ts --execute --wait
`);
}

// ============ GraphQL Query ============

const CONDITIONS_PAGE_SIZE = 30;

const UNRESOLVED_CONDITIONS_QUERY = `
query UnresolvedConditions($take: Int!, $skip: Int!, $resolver: String!) {
  conditions(
    where: {
      AND: [
        { settled: { equals: false } }
        { resolver: { equals: $resolver, mode: insensitive } }
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
    question
  }
}
`;

// ============ API Functions ============

async function fetchConditionsPage(
  apiUrl: string,
  resolver: string,
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

  return result.data?.conditions ?? [];
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

// ============ Polymarket API Fallback ============

interface PolymarketMarketResponse {
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
}

async function checkPolymarketApiResolution(
  conditionId: string
): Promise<boolean> {
  // Try gamma API first
  try {
    const gammaUrl = `${GAMMA_API_URL}/markets?condition_ids=${conditionId}`;
    const response = await fetchWithRetry(gammaUrl, {
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const markets = (await response.json()) as PolymarketMarketResponse[];
      if (markets.length > 0 && (markets[0].closed || markets[0].archived)) {
        const status = markets[0].archived ? 'archived' : 'closed';
        console.log(
          `[${conditionId.slice(0, 10)}...] Polymarket gamma API: market is ${status}`
        );
        return true;
      }
    }
  } catch {
    // Gamma API unavailable, try CLOB
  }

  // Fallback to CLOB API
  try {
    const clobUrl = `${CLOB_API_URL}/markets/${conditionId}`;
    const response = await fetchWithRetry(clobUrl, {
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const market = (await response.json()) as PolymarketMarketResponse;
      if (market.closed || market.archived) {
        const status = market.archived ? 'archived' : 'closed';
        console.log(
          `[${conditionId.slice(0, 10)}...] Polymarket CLOB API: market is ${status}`
        );
        return true;
      }
    }
  } catch {
    // CLOB API also unavailable
  }

  return false;
}

// ============ Condition Processing ============

async function resolveCondition(
  polygonClient: PublicClient,
  etherealClient: PublicClient,
  conditionId: Hex,
  resolverAddress: Address
): Promise<SettlementCandidate | 'already-settled' | 'not-resolved' | string> {
  // Check if already settled on ManualConditionResolver
  try {
    const [isResolved] = await etherealClient.readContract({
      address: resolverAddress,
      abi: manualConditionResolverAbi,
      functionName: 'getResolution',
      args: [conditionId],
    });

    if (isResolved) {
      console.log(
        `[${conditionId}] Already settled on ManualConditionResolver`
      );
      return 'already-settled';
    }
  } catch {
    // Revert means not yet resolved — proceed
  }

  // Check if resolved on Polymarket via Polygon
  console.log(
    `[${conditionId}] Checking canRequestResolution on Polygon (reader=${CONDITIONAL_TOKENS_READER_ADDRESS})...`
  );
  const canResolve = await polygonClient.readContract({
    address: CONDITIONAL_TOKENS_READER_ADDRESS,
    abi: conditionalTokensReaderAbi,
    functionName: 'canRequestResolution',
    args: [conditionId],
  });
  console.log(`[${conditionId}] canRequestResolution = ${canResolve}`);

  if (canResolve) {
    // Read the full resolution data
    console.log(`[${conditionId}] Reading resolution data from Polygon...`);
    const conditionData = await polygonClient.readContract({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'getConditionResolution',
      args: [conditionId],
    });

    const outcome = determineOutcomeFromPolymarket([
      conditionData.yesPayout,
      conditionData.noPayout,
    ]);
    console.log(
      `[${conditionId}] Polygon outcome: ${outcomeToString(outcome)} (yes=${conditionData.yesPayout}, no=${conditionData.noPayout})`
    );

    return { conditionId, outcome, source: 'polygon' };
  }

  // Fallback: check Polymarket REST APIs for voided/closed markets
  console.log(
    `[${conditionId}] Not resolved on-chain, checking Polymarket APIs...`
  );
  const isClosedOnApi = await checkPolymarketApiResolution(conditionId);

  if (isClosedOnApi) {
    const outcome: OutcomeVector = { yesWeight: 1n, noWeight: 1n };
    console.log(
      `[${conditionId}] Market voided/closed on Polymarket API, settling as TIE`
    );
    return { conditionId, outcome, source: 'api' };
  }

  console.log(`[${conditionId}] Not resolved anywhere yet, skipping`);
  return 'not-resolved';
}

// ============ Per-resolver processing ============

interface ResolverResults {
  label: string;
  total: number;
  alreadySettled: number;
  settled: number;
  notResolved: number;
  errors: number;
}

async function processResolver(
  resolverAddress: Address,
  label: string,
  options: CLIOptions,
  sapienceApiUrl: string,
  polygonClient: PublicClient,
  etherealClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account> | null
): Promise<ResolverResults> {
  const results: ResolverResults = {
    label,
    total: 0,
    alreadySettled: 0,
    settled: 0,
    notResolved: 0,
    errors: 0,
  };

  const conditions = await fetchUnresolvedConditions(
    sapienceApiUrl,
    resolverAddress
  );
  results.total = conditions.length;

  if (conditions.length === 0) {
    console.log('No unsettled conditions for this resolver');
    return results;
  }

  console.log(
    `Processing ${conditions.length} conditions (mode: ${options.dryRun ? 'dry-run' : 'execute'})...`
  );

  const candidates: SettlementCandidate[] = [];

  // Phase 1: Resolve all conditions, collecting settlement candidates
  for (const condition of conditions) {
    try {
      console.log(`[${condition.id}] "${condition.question}"`);
      const result = await resolveCondition(
        polygonClient,
        etherealClient,
        condition.id as Hex,
        resolverAddress
      );

      if (result === 'already-settled') {
        results.alreadySettled++;
      } else if (result === 'not-resolved') {
        results.notResolved++;
      } else if (typeof result === 'string') {
        console.error(`Error for ${condition.id}: ${result}`);
        results.errors++;
      } else {
        candidates.push(result);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error for ${condition.id}: ${msg}`);
      results.errors++;
    }
  }

  console.log(
    `\nResolution check complete: ${candidates.length} ready to settle, ${results.alreadySettled} already settled, ${results.notResolved} not resolved yet, ${results.errors} errors`
  );

  if (candidates.length === 0) {
    console.log('Nothing to settle');
    return results;
  }

  // Log what we're settling
  for (const c of candidates) {
    console.log(
      `  ${c.conditionId} → ${outcomeToString(c.outcome)} (via ${c.source})`
    );
  }

  if (options.dryRun) {
    console.log(
      `\nDRY RUN — would settle ${candidates.length} conditions via settleConditions()`
    );
    results.settled = candidates.length;
    return results;
  }

  if (!walletClient) {
    console.error('No wallet client (missing ADMIN_PRIVATE_KEY)');
    results.errors += candidates.length;
    return results;
  }

  // Phase 2: Batch settle
  const conditionIds = candidates.map((c) => c.conditionId);
  const outcomes = candidates.map((c) => c.outcome);

  if (candidates.length === 1) {
    const { conditionId, outcome } = candidates[0];
    console.log(
      `\nSettling 1 condition: ${conditionId} → ${outcomeToString(outcome)}`
    );

    const estimatedGas = await etherealClient.estimateContractGas({
      address: resolverAddress,
      abi: manualConditionResolverAbi,
      functionName: 'settleCondition',
      args: [conditionId, outcome],
      account: walletClient.account,
    });
    const gasLimit = (estimatedGas * 130n) / 100n;

    const hash = await walletClient.writeContract({
      address: resolverAddress,
      abi: manualConditionResolverAbi,
      functionName: 'settleCondition',
      args: [conditionId, outcome],
      gas: gasLimit,
    });

    console.log(`Transaction sent: ${hash}`);

    if (options.wait) {
      console.log('Waiting for confirmation...');
      const receipt = await etherealClient.waitForTransactionReceipt({ hash });
      console.log(`Confirmed in block ${receipt.blockNumber}`);
    }

    results.settled = 1;
  } else {
    console.log(`\nBatch settling ${candidates.length} conditions...`);

    const estimatedGas = await etherealClient.estimateContractGas({
      address: resolverAddress,
      abi: manualConditionResolverAbi,
      functionName: 'settleConditions',
      args: [conditionIds, outcomes],
      account: walletClient.account,
    });
    const gasLimit = (estimatedGas * 130n) / 100n;
    console.log(`Estimated gas: ${estimatedGas}, using limit: ${gasLimit}`);

    const hash = await walletClient.writeContract({
      address: resolverAddress,
      abi: manualConditionResolverAbi,
      functionName: 'settleConditions',
      args: [conditionIds, outcomes],
      gas: gasLimit,
    });

    console.log(`Transaction sent: ${hash}`);

    if (options.wait) {
      console.log('Waiting for confirmation...');
      const receipt = await etherealClient.waitForTransactionReceipt({ hash });
      console.log(`Confirmed in block ${receipt.blockNumber}`);
    }

    results.settled = candidates.length;
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

  const resolvers = getManualResolverAddresses();

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

  console.log(`Chain: ${CHAIN_ID}`);
  console.log(`Manual resolvers: ${resolvers.length} (current + legacy)`);
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'execute'}`);

  // Polygon client — read Polymarket resolution data
  const polygonClient = createPublicClient({
    chain: polygon,
    transport: http(polygonRpcUrl),
  });

  // Ethereal testnet client — read/write ManualConditionResolver
  const etherealClient = createPublicClient({
    chain: etherealTestnet,
    transport: http(ETHEREAL_RPC),
  });

  let walletClient: WalletClient<Transport, Chain, Account> | null = null;

  if (privateKey) {
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey
      : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as Hex);

    walletClient = createWalletClient({
      account,
      chain: etherealTestnet,
      transport: http(ETHEREAL_RPC),
    });

    const balance = await etherealClient.getBalance({
      address: account.address,
    });
    console.log(
      `Wallet ${account.address} balance: ${formatEther(balance)} ETH`
    );
  }

  try {
    const allResults: ResolverResults[] = [];

    for (const resolver of resolvers) {
      console.log(`\n=== Manual resolver: ${resolver.label} ===`);
      console.log(`  Address: ${resolver.address}`);

      const results = await processResolver(
        resolver.address,
        resolver.label,
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
        `[${r.label}] Total: ${r.total}, Already settled: ${r.alreadySettled}, Settled: ${r.settled}, Not resolved: ${r.notResolved}, Errors: ${r.errors}`
      );
    }

    const totals = allResults.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        alreadySettled: acc.alreadySettled + r.alreadySettled,
        settled: acc.settled + r.settled,
        notResolved: acc.notResolved + r.notResolved,
        errors: acc.errors + r.errors,
      }),
      { total: 0, alreadySettled: 0, settled: 0, notResolved: 0, errors: 0 }
    );

    console.log(`\nTotal across all resolvers:`);
    console.log(`  Conditions:          ${totals.total}`);
    console.log(`  Already settled:     ${totals.alreadySettled}`);
    console.log(`  Settled (tx sent):   ${totals.settled}`);
    console.log(`  Not resolved:        ${totals.notResolved}`);
    console.log(`  Errors:              ${totals.errors}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run
logSeparator('market-keeper:settle-manual', 'START');
main().finally(() => logSeparator('market-keeper:settle-manual', 'END'));
