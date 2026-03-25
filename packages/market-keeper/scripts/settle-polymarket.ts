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
import { fetchWithRetry } from '../src/utils/fetch.js';
import { confirmProductionAccess } from '../src/utils/index.js';
import { conditionalTokensConditionResolver } from '@sapience/sdk';
import {
  createPolygonClient,
  createPolygonWalletClient,
  canRequestResolution as checkCanRequestResolution,
  requestResolution as sendRequestResolution,
} from '../src/polygon/client.js';

// ============ Constants ============

const RESOLVER_CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

const RESOLVER_ADDRESS = (process.env.RESOLVER_ADDRESS ||
  conditionalTokensConditionResolver[RESOLVER_CHAIN_ID]?.address) as Address;

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
  conditions: SapienceCondition[];
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

// Resolver ABI — getResolution to check if already settled
const resolverAbi = [
  {
    type: 'function',
    name: 'getResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes' }],
    outputs: [
      { name: 'resolved', type: 'bool' },
      {
        name: 'outcome',
        type: 'tuple',
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

// ============ Settlement Logic ============

async function checkAndSettleCondition(
  polygonClient: PublicClient,
  etherealClient: PublicClient,
  walletClient: WalletClient<Transport, Chain, Account> | null,
  condition: SapienceCondition,
  options: CLIOptions
): Promise<SettlementResult> {
  const conditionId = condition.id as Hex;

  try {
    // Step 1: Check if already settled on ConditionalTokensConditionResolver
    console.log(
      `[${conditionId}] Checking ConditionalTokensConditionResolver...`
    );
    try {
      const [isResolved] = await etherealClient.readContract({
        address: RESOLVER_ADDRESS,
        abi: resolverAbi,
        functionName: 'getResolution',
        args: [conditionId],
      });

      if (isResolved) {
        console.log(
          `[${conditionId}] Already settled on ConditionalTokensConditionResolver`
        );
        return {
          conditionId,
          alreadyResolved: true,
          canResolve: false,
          settled: false,
        };
      }
    } catch (err) {
      // Revert likely means not yet resolved on Ethereal — proceed with Polygon check
      console.log(
        `[${conditionId}] getResolution reverted (${err instanceof Error ? err.message : String(err)}), proceeding to Polygon check`
      );
    }

    // Step 2: Check if resolved on Polygon (ConditionalTokensReader)
    console.log(`[${conditionId}] Checking canRequestResolution on Polygon...`);
    const canResolve = await checkCanRequestResolution(polygonClient, conditionId);

    if (!canResolve) {
      console.log(`[${conditionId}] Not resolved on Polygon yet, skipping`);
      return {
        conditionId,
        alreadyResolved: false,
        canResolve: false,
        settled: false,
      };
    }

    if (options.dryRun) {
      console.log(
        `[${conditionId}] DRY RUN — would call requestResolution (LZ bridge)`
      );
      return {
        conditionId,
        alreadyResolved: false,
        canResolve: true,
        settled: false,
      };
    }

    if (!walletClient) {
      return {
        conditionId,
        alreadyResolved: false,
        canResolve: true,
        settled: false,
        error: 'No wallet client (missing ADMIN_PRIVATE_KEY)',
      };
    }

    // Send requestResolution on Polygon (triggers LZ bridge to Ethereal)
    console.log(`[${conditionId}] Sending requestResolution...`);
    const hash = await sendRequestResolution(polygonClient, walletClient, conditionId);
    console.log(`[${conditionId}] Transaction sent: ${hash}`);

    if (options.wait) {
      console.log(`[${conditionId}] Waiting for confirmation...`);
      const receipt = await polygonClient.waitForTransactionReceipt({
        hash,
      });
      console.log(
        `[${conditionId}] Confirmed in block ${receipt.blockNumber}`
      );
    }

    return {
      conditionId,
      alreadyResolved: false,
      canResolve: true,
      settled: true,
      txHash: hash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      conditionId,
      alreadyResolved: false,
      canResolve: false,
      settled: false,
      error: errorMessage,
    };
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

  // Polygon client — read ConditionalTokensReader
  const polygonClient = createPolygonClient(polygonRpcUrl);

  // Ethereal client — read resolver state
  const etherealClient = createPublicClient({
    chain: etherealChain,
    transport: http(ETHEREAL_RPC),
  });

  console.log(
    `Ethereal client connected (chain ${RESOLVER_CHAIN_ID}, resolver ${RESOLVER_ADDRESS})`
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
    const conditions = await fetchUnresolvedConditions(sapienceApiUrl);

    if (conditions.length === 0) {
      console.log('No unsettled conditions found');
      return;
    }

    console.log(
      `Processing ${conditions.length} conditions (mode: ${options.dryRun ? 'dry-run' : 'execute'})`
    );

    const results = {
      total: conditions.length,
      alreadyResolved: 0,
      canResolve: 0,
      settled: 0,
      skipped: 0,
      errors: 0,
    };

    for (const condition of conditions) {
      const result = await checkAndSettleCondition(
        polygonClient,
        etherealClient,
        walletClient,
        condition,
        options
      );

      if (result.alreadyResolved) {
        results.alreadyResolved++;
      } else if (result.error) {
        console.error(`Error for ${condition.id}: ${result.error}`);
        results.errors++;
      } else if (!result.canResolve) {
        results.skipped++;
      } else {
        results.canResolve++;
        if (result.settled) results.settled++;
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total conditions:        ${results.total}`);
    console.log(`Already on resolver:     ${results.alreadyResolved}`);
    console.log(`Resolved on Polygon:     ${results.canResolve}`);
    console.log(`Settled (tx sent):       ${results.settled}`);
    console.log(`Skipped (not resolved):  ${results.skipped}`);
    console.log(`Errors:                  ${results.errors}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run
import { logSeparator } from '../src/utils/log.js';

logSeparator('market-keeper:settle-polymarket', 'START');
main().finally(() => logSeparator('market-keeper:settle-polymarket', 'END'));
