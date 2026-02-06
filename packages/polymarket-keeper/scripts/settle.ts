#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * Settle Sapience conditions by bridging resolution data from Polymarket via LayerZero
 *
 * This script:
 * 1. Queries Sapience API for unsettled conditions that have ended
 * 2. Checks if each condition is resolved on Polymarket (via ConditionalTokensReader on Polygon)
 * 3. Triggers LayerZero resolution bridging by calling requestResolution
 *
 * Usage:
 *   tsx scripts/settle.ts --dry-run
 *   tsx scripts/settle.ts --execute
 *
 * Options:
 *   --dry-run      Check conditions without sending transactions (default)
 *   --execute      Actually send settlement transactions
 *   --wait         Wait for transaction confirmations
 *   --help         Show this help message
 *
 * Environment Variables (can be set in .env file):
 *   POLYGON_RPC_URL    Polygon RPC URL (required)
 *   ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
 *   SAPIENCE_API_URL   Sapience GraphQL API URL (default: https://api.sapience.xyz/graphql)
 */

import 'dotenv/config';

import { confirmProductionAccess } from '../src/utils/index.js';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Account,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { fetchWithRetry } from '../src/utils/fetch.js';

// ============ Constants ============

// ConditionalTokensReader contract on Polygon
const CONDITIONAL_TOKENS_READER_ADDRESS = '0x97b356E9689dCEa3a268Ac6D7d8A87A24fa95ae2' as Address;

// Default Sapience API URL
const DEFAULT_SAPIENCE_API_URL = 'https://api.sapience.xyz/graphql';

// Polygon chain ID
const POLYGON_CHAIN_ID = 137;

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
  conditions: SapienceCondition[];
}

// ============ ABI ============

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
    name: 'quoteResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [
      {
        name: 'fee',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'requestResolution',
    stateMutability: 'payable',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

// ============ CLI Arguments ============

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const hasArg = (name: string): boolean =>
    args.includes(`--${name}`) || args.some(a => a.startsWith(`--${name}=`));

  return {
    dryRun: hasArg('dry-run') || !hasArg('execute'),
    execute: hasArg('execute'),
    wait: hasArg('wait'),
    help: hasArg('help') || hasArg('h'),
  };
}

function showHelp(): void {
  console.log(`
Usage: tsx scripts/settle.ts [options]

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL    Polygon RPC URL (required)
  ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL   Sapience GraphQL API URL (default: https://api.sapience.xyz/graphql)

Examples:
  # Dry run - check which conditions can be settled
  tsx scripts/settle.ts --dry-run

  # Execute settlements
  POLYGON_RPC_URL=https://polygon-rpc.com ADMIN_PRIVATE_KEY=0x... \\
    tsx scripts/settle.ts --execute --wait
`);
}

// ============ GraphQL Query ============

// Page size for fetching conditions (to avoid query complexity limits)
const CONDITIONS_PAGE_SIZE = 30;

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
  }
}
`;

// ============ API Functions ============

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
      'Accept': 'application/json',
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
    result = await response.json() as GraphQLResponse<ConditionsQueryResponse>;
  } catch {
    const text = await response.clone().text().catch(() => '(could not read body)');
    throw new Error(
      `Failed to parse GraphQL response as JSON\n` +
      `URL: ${apiUrl}\n` +
      `Response: ${text.slice(0, 500)}`
    );
  }

  if (result.errors?.length) {
    throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join('; ')}`);
  }

  return result.data?.conditions ?? [];
}

async function fetchUnresolvedConditions(apiUrl: string): Promise<SapienceCondition[]> {
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const allConditions: SapienceCondition[] = [];
  let skip = 0;

  console.log(`Fetching unresolved conditions from ${apiUrl}...`);

  while (true) {
    // Fetch one extra to check if there's a next page
    const page = await fetchConditionsPage(apiUrl, nowTimestamp, CONDITIONS_PAGE_SIZE + 1, skip);

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

// ============ Blockchain Functions ============

interface SettlementResult {
  conditionId: string;
  canResolve: boolean;
  settled: boolean;
  txHash?: string;
  error?: string;
}

async function checkAndSettleCondition(
  publicClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account> | null,
  condition: SapienceCondition,
  options: CLIOptions
): Promise<SettlementResult> {
  const conditionId = condition.id as Hex;

  try {
    // Check if condition can be resolved on Polymarket
    console.log(`[${conditionId}] Checking canRequestResolution...`);
    const canResolve = await publicClient.readContract({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'canRequestResolution',
      args: [conditionId],
    });

    if (!canResolve) {
      console.log(`[${conditionId}] Not resolved on Polymarket yet`);
      return { conditionId, canResolve: false, settled: false };
    }

    // Get the LayerZero fee quote
    console.log(`[${conditionId}] Getting LayerZero fee quote...`);
    const fee = await publicClient.readContract({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'quoteResolution',
      args: [conditionId],
    });

    const nativeFee = fee.nativeFee;
    console.log(`[${conditionId}] LayerZero fee: ${formatEther(nativeFee)} POL`);

    if (options.dryRun) {
      console.log(`[${conditionId}] DRY RUN - would call requestResolution`);
      return { conditionId, canResolve: true, settled: false };
    }

    if (!walletClient) {
      return { conditionId, canResolve: true, settled: false, error: 'No wallet client (missing ADMIN_PRIVATE_KEY)' };
    }

    // Execute the settlement
    console.log(`[${conditionId}] Estimating gas...`);
    const estimatedGas = await publicClient.estimateContractGas({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'requestResolution',
      args: [conditionId],
      value: nativeFee,
      account: walletClient.account,
    });
    const gasLimit = (estimatedGas * 130n) / 100n; // Add 30% buffer
    console.log(`[${conditionId}] Estimated gas: ${estimatedGas}, using limit: ${gasLimit}`);

    console.log(`[${conditionId}] Sending requestResolution transaction...`);
    const hash = await walletClient.writeContract({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'requestResolution',
      args: [conditionId],
      value: nativeFee,
      gas: gasLimit,
    });

    console.log(`[${conditionId}] Transaction sent: ${hash}`);

    if (options.wait) {
      console.log(`[${conditionId}] Waiting for confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[${conditionId}] Confirmed in block ${receipt.blockNumber}`);
    }

    return { conditionId, canResolve: true, settled: true, txHash: hash };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { conditionId, canResolve: false, settled: false, error: errorMessage };
  }
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
    sapienceApiUrl = DEFAULT_SAPIENCE_API_URL;
  }

  if (!polygonRpcUrl) {
    console.error('POLYGON_RPC_URL environment variable is required');
    process.exit(1);
  }

  if (options.execute && !privateKey) {
    console.error('ADMIN_PRIVATE_KEY environment variable is required for --execute mode');
    process.exit(1);
  }

  // Confirm production access if pointing to production without NODE_ENV=production
  await confirmProductionAccess(process.env.SAPIENCE_API_URL);

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(polygonRpcUrl),
  });

  let walletClient: WalletClient<Transport, typeof polygon, Account> | null = null;

  if (privateKey) {
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as Hex);

    walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    // Check wallet balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`Wallet ${account.address} balance: ${formatEther(balance)} POL`);
  }

  try {
    const conditions = await fetchUnresolvedConditions(sapienceApiUrl);

    if (conditions.length === 0) {
      console.log('No unsettled conditions found');
      return;
    }

    console.log(`Processing ${conditions.length} conditions with open interest or forecasts (mode: ${options.dryRun ? 'dry-run' : 'execute'})`);

    const results = {
      total: conditions.length,
      canResolve: 0,
      settled: 0,
      skipped: 0,
      errors: 0,
    };

    for (const condition of conditions) {
      const result = await checkAndSettleCondition(
        publicClient,
        walletClient,
        condition,
        options
      );

      if (result.error) {
        console.error(`Error for ${condition.id}: ${result.error}`);
        results.errors++;
      } else if (!result.canResolve) {
        results.skipped++;
      } else if (result.settled) {
        results.settled++;
        results.canResolve++;
      } else {
        results.canResolve++;
      }
    }

    // Summary
    console.log(`Summary: ${results.total} processed, ${results.canResolve} resolvable, ${results.settled} settled, ${results.skipped} skipped, ${results.errors} errors`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run
main();
