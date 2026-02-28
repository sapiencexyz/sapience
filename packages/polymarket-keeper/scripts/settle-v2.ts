#!/usr/bin/env node
/// <reference types="node" />
/**
 * Settle conditions on ManualConditionResolver (v2 protocol)
 *
 * This script:
 * 1. Queries Sapience API for unsettled conditions that have ended
 * 2. Checks if each condition is already settled on the ManualConditionResolver (Ethereal testnet)
 * 3. Checks if each condition is resolved on Polymarket (via ConditionalTokensReader on Polygon)
 * 4. Falls back to Polymarket REST APIs for voided markets
 * 5. Writes the outcome to the ManualConditionResolver via settleCondition()
 *
 * Usage:
 *   tsx scripts/settle-v2.ts --dry-run
 *   tsx scripts/settle-v2.ts --execute
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
 *   V2_RESOLVER_ADDRESS      ManualConditionResolver address on Ethereal testnet
 *   V2_CHAIN_ID              Ethereal testnet chain ID
 */

import 'dotenv/config';

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
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { fetchWithRetry } from '../src/utils/fetch.js';
import { confirmProductionAccess } from '../src/utils/index.js';
import {
  manualConditionResolver,
  conditionalTokensReader,
} from '@sapience/sdk/contracts';

// ============ Constants ============

// Ethereal testnet chain ID
const V2_CHAIN_ID = Number(process.env.CHAIN_ID || '13374202');

// ManualConditionResolver on Ethereal (env override or SDK address for chain)
const V2_RESOLVER_ADDRESS = (process.env.V2_RESOLVER_ADDRESS ||
  manualConditionResolver[V2_CHAIN_ID]?.address) as Address;

// Ethereal testnet RPC
const ETHEREAL_TESTNET_RPC = 'https://rpc.etherealtest.net';

// ConditionalTokensReader contract on Polygon
const CONDITIONAL_TOKENS_READER_ADDRESS = (process.env
  .CONDITIONAL_TOKENS_READER_ADDRESS ||
  conditionalTokensReader[137]?.address) as Address;

// Default Sapience API URL
const DEFAULT_API_URL = 'https://api.sapience.xyz/graphql';

// Polymarket API URLs
const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob.polymarket.com';

// ============ Chain Definition ============

const etherealTestnet = defineChain({
  id: V2_CHAIN_ID,
  name: 'Ethereal Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_TESTNET_RPC] },
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
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ConditionsQueryResponse {
  conditions: SapienceCondition[];
}

interface OutcomeVector {
  yesWeight: bigint;
  noWeight: bigint;
}

interface SettlementResult {
  conditionId: string;
  alreadyResolved: boolean;
  resolvedOnPolygon: boolean;
  resolvedViaApi: boolean;
  settled: boolean;
  outcome?: OutcomeVector;
  txHash?: string;
  error?: string;
}

// ============ ABIs ============

// ConditionalTokensReader (Polygon) — reads Polymarket resolution data
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

// ManualConditionResolver (Ethereal testnet) — settles conditions with outcome vectors
const manualConditionResolverAbi = [
  {
    type: 'function',
    name: 'getResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
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
  {
    type: 'function',
    name: 'settleCondition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'conditionId', type: 'bytes32' },
      {
        name: 'outcome',
        type: 'tuple',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
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
Usage: tsx scripts/settle-v2.ts [options]

Settles conditions on ManualConditionResolver (v2 protocol) by reading
resolution data from Polymarket on Polygon.

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  POLYGON_RPC_URL          Polygon RPC URL (required)
  ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL         Sapience GraphQL API URL (default: https://api.sapience.xyz)
  V2_RESOLVER_ADDRESS      ManualConditionResolver address (default: from SDK for V2_CHAIN_ID)
  V2_CHAIN_ID              Ethereal testnet chain ID (default: 13374202)

Examples:
  # Dry run - check which conditions can be settled
  tsx scripts/settle-v2.ts --dry-run

  # Execute settlements
  POLYGON_RPC_URL=https://polygon-rpc.com ADMIN_PRIVATE_KEY=0x... \\
    tsx scripts/settle-v2.ts --execute --wait
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

// ============ Polymarket API Fallback ============

interface PolymarketMarketResponse {
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
  umaResolutionStatus?: string;
  condition_id?: string;
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

// ============ Outcome Conversion ============

function payoutsToOutcomeVector(
  yesPayout: bigint,
  noPayout: bigint
): OutcomeVector {
  if (yesPayout > noPayout) {
    return { yesWeight: 1n, noWeight: 0n }; // YES wins
  } else if (noPayout > yesPayout) {
    return { yesWeight: 0n, noWeight: 1n }; // NO wins
  } else {
    return { yesWeight: 1n, noWeight: 1n }; // Tie
  }
}

function outcomeToString(outcome: OutcomeVector): string {
  if (outcome.yesWeight > 0n && outcome.noWeight === 0n) return 'YES';
  if (outcome.yesWeight === 0n && outcome.noWeight > 0n) return 'NO';
  if (outcome.yesWeight > 0n && outcome.noWeight > 0n) return 'TIE';
  return 'INVALID';
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
    // Step 1: Check if already settled on ManualConditionResolver
    console.log(`[${conditionId}] Checking ManualConditionResolver...`);
    const [isResolved] = await etherealClient.readContract({
      address: V2_RESOLVER_ADDRESS,
      abi: manualConditionResolverAbi,
      functionName: 'getResolution',
      args: [conditionId],
    });

    if (isResolved) {
      console.log(`[${conditionId}] Already settled on ManualConditionResolver`);
      return {
        conditionId,
        alreadyResolved: true,
        resolvedOnPolygon: false,
        resolvedViaApi: false,
        settled: false,
      };
    }

    // Step 2: Check if resolved on Polygon (ConditionalTokensReader)
    console.log(`[${conditionId}] Checking canRequestResolution on Polygon...`);
    const canResolve = await polygonClient.readContract({
      address: CONDITIONAL_TOKENS_READER_ADDRESS,
      abi: conditionalTokensReaderAbi,
      functionName: 'canRequestResolution',
      args: [conditionId],
    });

    let outcome: OutcomeVector | undefined;

    if (canResolve) {
      // Read the full resolution data from Polygon
      console.log(`[${conditionId}] Reading resolution data from Polygon...`);
      const conditionData = await polygonClient.readContract({
        address: CONDITIONAL_TOKENS_READER_ADDRESS,
        abi: conditionalTokensReaderAbi,
        functionName: 'getConditionResolution',
        args: [conditionId],
      });

      outcome = payoutsToOutcomeVector(
        conditionData.yesPayout,
        conditionData.noPayout
      );
      console.log(
        `[${conditionId}] Polygon outcome: ${outcomeToString(outcome)} (yes=${conditionData.yesPayout}, no=${conditionData.noPayout}, denom=${conditionData.payoutDenominator})`
      );
    } else {
      // Step 3: Fallback — check Polymarket APIs for voided markets
      console.log(
        `[${conditionId}] Not resolved on-chain, checking Polymarket APIs...`
      );
      const isClosedOnApi = await checkPolymarketApiResolution(conditionId);

      if (isClosedOnApi) {
        // Voided market — settle as tie
        outcome = { yesWeight: 1n, noWeight: 1n };
        console.log(
          `[${conditionId}] Market voided/closed on Polymarket API, settling as TIE`
        );
      } else {
        console.log(`[${conditionId}] Not resolved anywhere yet, skipping`);
        return {
          conditionId,
          alreadyResolved: false,
          resolvedOnPolygon: false,
          resolvedViaApi: false,
          settled: false,
        };
      }
    }

    // Settle the condition on ManualConditionResolver
    if (options.dryRun) {
      console.log(
        `[${conditionId}] DRY RUN — would call settleCondition(${outcomeToString(outcome)})`
      );
      return {
        conditionId,
        alreadyResolved: false,
        resolvedOnPolygon: canResolve,
        resolvedViaApi: !canResolve,
        settled: false,
        outcome,
      };
    }

    if (!walletClient) {
      return {
        conditionId,
        alreadyResolved: false,
        resolvedOnPolygon: canResolve,
        resolvedViaApi: !canResolve,
        settled: false,
        outcome,
        error: 'No wallet client (missing ADMIN_PRIVATE_KEY)',
      };
    }

    console.log(
      `[${conditionId}] Settling condition as ${outcomeToString(outcome)}...`
    );

    const outcomeArg = {
      yesWeight: outcome.yesWeight,
      noWeight: outcome.noWeight,
    } as const;

    const estimatedGas = await etherealClient.estimateContractGas({
      address: V2_RESOLVER_ADDRESS,
      abi: manualConditionResolverAbi,
      functionName: 'settleCondition' as const,
      args: [conditionId, outcomeArg] as readonly [
        `0x${string}`,
        typeof outcomeArg,
      ],
      account: walletClient.account,
    });
    const gasLimit = (estimatedGas * 130n) / 100n;
    console.log(
      `[${conditionId}] Estimated gas: ${estimatedGas}, using limit: ${gasLimit}`
    );

    const hash = await walletClient.writeContract({
      address: V2_RESOLVER_ADDRESS,
      abi: manualConditionResolverAbi,
      functionName: 'settleCondition' as const,
      args: [conditionId, outcomeArg] as readonly [
        `0x${string}`,
        typeof outcomeArg,
      ],
      gas: gasLimit,
    });

    console.log(`[${conditionId}] Transaction sent: ${hash}`);

    if (options.wait) {
      console.log(`[${conditionId}] Waiting for confirmation...`);
      const receipt = await etherealClient.waitForTransactionReceipt({ hash });
      console.log(`[${conditionId}] Confirmed in block ${receipt.blockNumber}`);
    }

    return {
      conditionId,
      alreadyResolved: false,
      resolvedOnPolygon: canResolve,
      resolvedViaApi: !canResolve,
      settled: true,
      outcome,
      txHash: hash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      conditionId,
      alreadyResolved: false,
      resolvedOnPolygon: false,
      resolvedViaApi: false,
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
  const polygonClient = createPublicClient({
    chain: polygon,
    transport: http(polygonRpcUrl),
  });

  // Ethereal testnet client — read ManualConditionResolver
  const etherealClient = createPublicClient({
    chain: etherealTestnet,
    transport: http(ETHEREAL_TESTNET_RPC),
  });

  console.log(
    `Ethereal testnet client connected (chain ${V2_CHAIN_ID}, resolver ${V2_RESOLVER_ADDRESS})`
  );

  let walletClient: WalletClient<
    Transport,
    typeof etherealTestnet,
    Account
  > | null = null;

  if (privateKey) {
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey
      : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as Hex);

    walletClient = createWalletClient({
      account,
      chain: etherealTestnet,
      transport: http(ETHEREAL_TESTNET_RPC),
    });

    // Check wallet balance on Ethereal testnet
    const balance = await etherealClient.getBalance({
      address: account.address,
    });
    console.log(
      `Wallet ${account.address} balance: ${formatEther(balance)} ETH (Ethereal testnet)`
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
      resolvedOnPolygon: 0,
      resolvedViaApi: 0,
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
      } else if (!result.resolvedOnPolygon && !result.resolvedViaApi) {
        results.skipped++;
      } else {
        if (result.resolvedOnPolygon) results.resolvedOnPolygon++;
        if (result.resolvedViaApi) results.resolvedViaApi++;
        if (result.settled) results.settled++;
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total conditions:        ${results.total}`);
    console.log(`Already on resolver:     ${results.alreadyResolved}`);
    console.log(`Resolved on Polygon:     ${results.resolvedOnPolygon}`);
    console.log(`Resolved via API:        ${results.resolvedViaApi}`);
    console.log(`Settled (tx sent):       ${results.settled}`);
    console.log(`Skipped (not resolved):  ${results.skipped}`);
    console.log(`Errors:                  ${results.errors}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run
main();
