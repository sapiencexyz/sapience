#!/usr/bin/env node
/// <reference types="node" />
/**
 * Settle PythConditionResolver conditions via Pyth Lazer price updates.
 *
 * Discovers candidate conditions by querying GraphQL for ended/unsettled conditions
 * whose resolver matches the PythConditionResolver address, parses market parameters
 * from each condition's description field, fetches signed price data from Pyth Lazer,
 * and calls settleCondition on-chain.
 *
 * Safe by default: dry-run unless you pass --execute.
 *
 * Usage:
 *   tsx scripts/settle-pyth.ts --dry-run
 *   tsx scripts/settle-pyth.ts --execute
 *   tsx scripts/settle-pyth.ts --execute --wait
 *
 * Options:
 *   --dry-run      Check conditions without sending transactions (default)
 *   --execute      Actually send settlement transactions
 *   --wait         Wait for transaction confirmations
 *   --help         Show this help message
 *
 * Environment Variables (can be set in .env file):
 *   PYTH_CONSUMER_TOKEN      Pyth Lazer API bearer token (script skips if missing)
 *   ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
 *   SAPIENCE_API_URL         Sapience GraphQL API URL (default: https://api.sapience.xyz)
 *   CHAIN_ID                 Ethereal chain ID override (default: 5064014)
 *   PYTH_BASE_URL            Pyth Lazer API base URL (default: https://pyth-lazer.dourolabs.app)
 *   PYTH_RESOLVER_ADDRESS    Override resolver address (default: from SDK)
 */

import 'dotenv/config';

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  hexToBytes,
  http,
  keccak256,
  recoverAddress,
  sliceHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  pythConditionResolver,
  getPythMarketHash,
  decodePythMarketId,
} from '@sapience/sdk';
import { fetchWithRetry } from '../src/utils/fetch.js';
import { confirmProductionAccess } from '../src/utils/index.js';
import { logSeparator } from '../src/utils/log.js';
import {
  decodeFeedIdFromPriceId,
  extractEvmBlobFromJson,
  parseLazerPayload,
  type Market,
} from '../src/pyth.js';

// ============ Constants ============

const CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

const PYTH_RESOLVER_ADDRESS = (process.env.PYTH_RESOLVER_ADDRESS ||
  pythConditionResolver[CHAIN_ID]?.address ||
  '') as Address;

const PYTH_CONSUMER_TOKEN =
  process.env.PYTH_CONSUMER_TOKEN || process.env.PYTH_API_KEY || '';

const PYTH_BASE_URL =
  process.env.PYTH_BASE_URL || 'https://pyth-lazer.dourolabs.app';

const ETHEREAL_RPC =
  process.env.ETHEREAL_RPC_URL || 'https://rpc.ethereal.trade';

const DEFAULT_API_URL = 'https://api.sapience.xyz/graphql';

const MAX_CONDITIONS = 200;

// ============ Chain Definition ============

const etherealChain = defineChain({
  id: CHAIN_ID,
  name: 'Ethereal',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_RPC] },
  },
});

// ============ Types ============

interface CLIOptions {
  dryRun: boolean;
  execute: boolean;
  wait: boolean;
  help: boolean;
}

interface ConditionRow {
  id: string;
  endTime: number;
  chainId: number;
  resolver?: string | null;
  description?: string | null;
  settled?: boolean;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ============ ABIs ============

const pythResolverAbi = [
  {
    type: 'function',
    name: 'pythLazer',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'settlements',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'settled', type: 'bool' },
      { name: 'resolvedToOver', type: 'bool' },
      { name: 'benchmarkPrice', type: 'int64' },
      { name: 'benchmarkExpo', type: 'int32' },
      { name: 'publishTime', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'settleCondition',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'market',
        type: 'tuple',
        components: [
          { name: 'priceId', type: 'bytes32' },
          { name: 'endTime', type: 'uint64' },
          { name: 'strikePrice', type: 'int64' },
          { name: 'strikeExpo', type: 'int32' },
          { name: 'overWinsOnTie', type: 'bool' },
        ],
      },
      { name: 'updateData', type: 'bytes[]' },
    ],
    outputs: [
      { name: 'conditionId', type: 'bytes32' },
      { name: 'resolvedToOver', type: 'bool' },
    ],
  },
] as const;

const pythLazerAbi = [
  {
    type: 'function',
    name: 'verification_fee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'verifyUpdate',
    stateMutability: 'payable',
    inputs: [{ name: 'update', type: 'bytes' }],
    outputs: [
      { name: 'payload', type: 'bytes' },
      { name: 'signer', type: 'address' },
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
Usage: tsx scripts/settle-pyth.ts [options]

Settles PythConditionResolver conditions by fetching Pyth Lazer price updates
and calling settleCondition on-chain.

Options:
  --dry-run      Check conditions without sending transactions (default)
  --execute      Actually send settlement transactions
  --wait         Wait for transaction confirmations
  --help, -h     Show this help message

Environment Variables:
  PYTH_CONSUMER_TOKEN      Pyth Lazer API bearer token (script skips if missing)
  ADMIN_PRIVATE_KEY        Private key for signing transactions (required for --execute)
  SAPIENCE_API_URL         Sapience GraphQL API URL (default: https://api.sapience.xyz)
  CHAIN_ID                 Ethereal chain ID override (default: 5064014)
  PYTH_BASE_URL            Pyth Lazer API base URL (default: https://pyth-lazer.dourolabs.app)
  PYTH_RESOLVER_ADDRESS    Override resolver address (default: from SDK)

Examples:
  # Dry run
  tsx scripts/settle-pyth.ts --dry-run

  # Execute with wait
  PYTH_CONSUMER_TOKEN=tok ADMIN_PRIVATE_KEY=0x... tsx scripts/settle-pyth.ts --execute --wait
`);
}

// ============ GraphQL ============

const CONDITIONS_QUERY = /* GraphQL */ `
  query ResolverConditions(
    $where: ConditionWhereInput
    $take: Int
    $skip: Int
  ) {
    conditions(where: $where, take: $take, skip: $skip) {
      id
      endTime
      chainId
      resolver
      description
      settled
    }
  }
`;

async function gql<T>(
  graphqlUrl: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetchWithRetry(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(could not read body)');
    throw new Error(`GraphQL ${response.status}: ${text}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`
    );
  }
  if (!json.data) throw new Error('GraphQL: missing data');
  return json.data;
}

// ============ Pyth Lazer Blob Fetching ============

async function fetchPythLazerEvmUpdateBlob(args: {
  pythBaseUrl: string;
  token?: string;
  feedId: number;
  endTimeSec: number;
}): Promise<Hex> {
  const base = args.pythBaseUrl.replace(/\/$/, '');
  const timestampUsNum = args.endTimeSec * 1_000_000;

  const channelsToTry = [
    'fixed_rate@50ms',
    'fixed_rate@200ms',
    'real_time',
  ] as const;

  const requestBodies: Array<Record<string, unknown>> = [];
  for (const channel of channelsToTry) {
    requestBodies.push({
      timestamp: timestampUsNum,
      priceFeedIds: [args.feedId],
      properties: ['price', 'exponent'],
      formats: ['evm'],
      channel,
      jsonBinaryEncoding: 'base64',
    });
  }

  const authVariants: Array<{
    label: string;
    url: string;
    headers: Record<string, string>;
  }> = [];

  // Try load balancer + instance-pinned fallbacks (pyth-lazer-0/1).
  const urlBases = [base];
  if (base.includes('pyth-lazer.dourolabs.app')) {
    urlBases.push(
      base.replace('pyth-lazer.dourolabs.app', 'pyth-lazer-0.dourolabs.app')
    );
    urlBases.push(
      base.replace('pyth-lazer.dourolabs.app', 'pyth-lazer-1.dourolabs.app')
    );
  }

  for (const b of urlBases) {
    const u = new URL(`${b.replace(/\/$/, '')}/v1/price`);
    authVariants.push({
      label: 'no-auth',
      url: u.toString(),
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
    });
    if (args.token) {
      authVariants.push({
        label: 'Authorization: Bearer',
        url: u.toString(),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          Authorization: `Bearer ${args.token}`,
        },
      });
      const uTok = new URL(u.toString());
      uTok.searchParams.set('ACCESS_TOKEN', args.token);
      authVariants.push({
        label: 'ACCESS_TOKEN query',
        url: uTok.toString(),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
      });
    }
  }

  let lastErr: unknown = null;
  let lastAttempt: { url: string; auth: string } | null = null;
  let lastBody: unknown = null;

  for (const v of authVariants) {
    for (const body of requestBodies) {
      lastAttempt = { url: v.url, auth: v.label };
      lastBody = body;
      try {
        const res = await fetchWithRetry(
          v.url,
          {
            method: 'POST',
            headers: v.headers,
            body: JSON.stringify(body),
          },
          3, // fewer retries per variant since we have many fallback combos
          500
        );
        const text = await res.text();
        if (!res.ok) throw new Error(`Pyth Lazer ${res.status}: ${text}`);

        let json: unknown;
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          throw new Error(
            `Pyth Lazer non-JSON response: ${text.slice(0, 200)}`
          );
        }

        const { blob } = extractEvmBlobFromJson(json);
        return blob;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw new Error(
    `Failed to fetch Pyth Lazer evm blob for feedId=${args.feedId} endTimeSec=${args.endTimeSec}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }${
      lastAttempt
        ? ` (lastAttempt auth=${lastAttempt.auth} url=${lastAttempt.url} body=${JSON.stringify(
            lastBody
          ).slice(0, 200)})`
        : ''
    }`
  );
}

// ============ Signer Recovery ============

async function recoverSignerFromLazerUpdate(
  update: Hex
): Promise<Address | null> {
  try {
    if (update.length < 2 + 71 * 2) return null;

    const r = sliceHex(update, 4, 36);
    const s = sliceHex(update, 36, 68);
    const vByteHex = sliceHex(update, 68, 69);
    const v0or1 = Number(BigInt(vByteHex));
    const v = v0or1 + 27;

    const lenBytes = hexToBytes(sliceHex(update, 69, 71));
    const payloadLen = (lenBytes[0]! << 8) | lenBytes[1]!;
    const payloadStart = 71;
    const payloadEnd = payloadStart + payloadLen;
    const payload = sliceHex(update, payloadStart, payloadEnd);

    const hash = keccak256(payload);
    const signature =
      `${r}${s.slice(2)}${v.toString(16).padStart(2, '0')}` as Hex;
    return (await recoverAddress({ hash, signature })) as Address;
  } catch {
    return null;
  }
}

// ============ Main ============

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Graceful skip if no Pyth token configured
  if (!PYTH_CONSUMER_TOKEN) {
    console.log(
      '[settle-pyth] PYTH_CONSUMER_TOKEN not set, skipping Pyth settlement'
    );
    process.exit(0);
  }

  // Graceful skip if no resolver address for this chain
  if (!PYTH_RESOLVER_ADDRESS || PYTH_RESOLVER_ADDRESS === '0x') {
    console.log(
      `[settle-pyth] No PythConditionResolver address for chainId=${CHAIN_ID}, skipping`
    );
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

  console.log(`[settle-pyth] chainId=${CHAIN_ID}`);
  console.log(`[settle-pyth] resolver=${PYTH_RESOLVER_ADDRESS}`);
  console.log(`[settle-pyth] api=${sapienceApiUrl}`);
  console.log(
    `[settle-pyth] mode=${options.dryRun ? 'dry-run' : 'execute'} wait=${options.wait}`
  );

  const publicClient = createPublicClient({
    chain: etherealChain,
    transport: http(ETHEREAL_RPC),
  });

  const walletClient =
    options.dryRun || !privateKey
      ? null
      : createWalletClient({
          account: privateKeyToAccount(
            (privateKey.startsWith('0x')
              ? privateKey
              : `0x${privateKey}`) as Hex
          ),
          chain: etherealChain,
          transport: http(ETHEREAL_RPC),
        });

  if (walletClient) {
    const balance = await publicClient.getBalance({
      address: walletClient.account.address,
    });
    console.log(
      `[settle-pyth] wallet=${walletClient.account.address} balance=${formatEther(balance)} ETH`
    );
  }

  // Read on-chain PythLazer address and verification fee
  const pythLazerAddress = (await publicClient.readContract({
    address: getAddress(PYTH_RESOLVER_ADDRESS),
    abi: pythResolverAbi,
    functionName: 'pythLazer',
  })) as Address;

  const verificationFee = (await publicClient.readContract({
    address: pythLazerAddress,
    abi: pythLazerAbi,
    functionName: 'verification_fee',
  })) as bigint;

  console.log(`[settle-pyth] pythLazer=${pythLazerAddress}`);
  console.log(
    `[settle-pyth] verification_fee=${verificationFee.toString()} wei`
  );

  // 1) Find ended, unsettled conditions whose resolver is the PythConditionResolver
  const nowSec = Math.floor(Date.now() / 1000);
  const conditions: ConditionRow[] = [];

  console.log('[settle-pyth] Fetching unsettled Pyth conditions...');

  for (let skip = 0; conditions.length < MAX_CONDITIONS; skip += 50) {
    const take = Math.min(50, MAX_CONDITIONS - conditions.length);
    const data = await gql<{ conditions: ConditionRow[] }>(
      sapienceApiUrl,
      CONDITIONS_QUERY,
      {
        where: {
          chainId: { equals: CHAIN_ID },
          endTime: { lte: nowSec },
          settled: { equals: false },
          resolver: {
            equals: PYTH_RESOLVER_ADDRESS,
            mode: 'insensitive',
          },
        },
        take,
        skip,
      }
    );
    if (data.conditions.length === 0) break;
    conditions.push(...data.conditions);
  }

  console.log(
    `[settle-pyth] Found ${conditions.length} ended unsettled conditions`
  );

  if (conditions.length === 0) {
    console.log('[settle-pyth] Nothing to settle');
    return;
  }

  // 2) Decode market parameters from each condition's conditionId (ABI-encoded)
  const marketsById = new Map<Hex, Market>();
  let skippedDecode = 0;
  for (const c of conditions) {
    const market = decodePythMarketId(c.id as Hex);
    if (!market) {
      skippedDecode++;
      continue;
    }
    const marketId = getPythMarketHash(market);
    marketsById.set(marketId, market);
  }

  if (skippedDecode > 0) {
    console.log(
      `[settle-pyth] Skipped ${skippedDecode} conditions with non-decodable conditionId`
    );
  }
  console.log(`[settle-pyth] Unique markets to settle: ${marketsById.size}`);

  // 3) Settle each market
  let attempted = 0;
  let submitted = 0;
  let skipped = 0;
  let errors = 0;

  for (const [marketId, market] of marketsById.entries()) {
    // Check if already settled on-chain
    try {
      const settlement = (await publicClient.readContract({
        address: getAddress(PYTH_RESOLVER_ADDRESS),
        abi: pythResolverAbi,
        functionName: 'settlements',
        args: [marketId],
      })) as readonly [boolean, boolean, bigint, number, bigint];

      if (settlement[0]) {
        skipped++;
        continue;
      }
    } catch (e) {
      console.warn(
        `[settle-pyth] Error checking settlement for ${marketId}: ${e instanceof Error ? e.message : String(e)}`
      );
      errors++;
      continue;
    }

    const endTimeSec = Number(market.endTime);
    const feedId = decodeFeedIdFromPriceId(market.priceId);
    if (typeof feedId !== 'number') {
      console.warn(
        `[settle-pyth] Skip market (non-lazer priceId): ${marketId}`
      );
      skipped++;
      continue;
    }

    attempted++;
    console.log(
      `[settle-pyth] market=${marketId} feedId=${feedId} endTime=${endTimeSec}`
    );

    // Fetch signed update from Pyth Lazer
    let blob: Hex;
    try {
      blob = await fetchPythLazerEvmUpdateBlob({
        pythBaseUrl: PYTH_BASE_URL,
        token: PYTH_CONSUMER_TOKEN,
        feedId,
        endTimeSec,
      });
    } catch (e) {
      console.warn(
        `[settle-pyth] Skip market (failed to fetch update): market=${marketId} feedId=${feedId} endTime=${endTimeSec} reason=${
          e instanceof Error ? e.message : String(e)
        }`
      );
      errors++;
      continue;
    }

    // Preflight: verify the update blob against the on-chain verifier
    try {
      const sim = await publicClient.simulateContract({
        address: pythLazerAddress,
        abi: pythLazerAbi,
        functionName: 'verifyUpdate',
        args: [blob],
        value: verificationFee,
      });
      const [payload] = sim.result as unknown as readonly [Hex, Address];
      const parsed = parseLazerPayload(payload);
      const publishTimeSec = Number(parsed.timestampUs / 1_000_000n);
      const isSecondAligned = parsed.timestampUs % 1_000_000n === 0n;
      const feed = parsed.feeds[feedId];
      const expo = feed?.exponent;

      if (!isSecondAligned) {
        throw new Error('preflight_not_second_aligned');
      }
      if (publishTimeSec !== endTimeSec) {
        throw new Error(
          `preflight_publish_time_mismatch:${publishTimeSec}!=${endTimeSec}`
        );
      }
      if (typeof expo !== 'number') {
        throw new Error('preflight_missing_exponent');
      }
      if (expo !== market.strikeExpo) {
        throw new Error(
          `preflight_exponent_mismatch:${expo}!=${market.strikeExpo}`
        );
      }
    } catch (e) {
      const recovered = await recoverSignerFromLazerUpdate(blob);
      console.warn(
        `[settle-pyth] Skip market (preflight failed): market=${marketId} recoveredSigner=${recovered ?? 'unknown'} reason=${
          e instanceof Error ? e.message : String(e)
        }`
      );
      errors++;
      continue;
    }

    if (options.dryRun) {
      console.log(
        `[settle-pyth] DRY RUN — would call settleCondition (value=${verificationFee.toString()} wei)`
      );
      continue;
    }

    if (!walletClient) {
      console.error('[settle-pyth] Wallet client not configured');
      errors++;
      continue;
    }

    try {
      const hash = await walletClient.writeContract({
        address: getAddress(PYTH_RESOLVER_ADDRESS),
        abi: pythResolverAbi,
        functionName: 'settleCondition',
        args: [market, [blob]],
        value: verificationFee,
      });
      console.log(`[settle-pyth] tx sent: ${hash}`);
      submitted++;

      if (options.wait) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(
          `[settle-pyth] tx mined in block ${receipt.blockNumber}: ${receipt.transactionHash}`
        );
      }
    } catch (e) {
      console.error(
        `[settle-pyth] tx failed for market=${marketId}: ${e instanceof Error ? e.message : String(e)}`
      );
      errors++;
    }
  }

  // Summary
  console.log('\n--- Pyth Settlement Summary ---');
  console.log(`Attempted:   ${attempted}`);
  console.log(`Submitted:   ${submitted}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Errors:      ${errors}`);
}

// Run
logSeparator('market-keeper:settle-pyth', 'START');
main()
  .catch((e) => {
    console.error('[settle-pyth] fatal:', e);
    process.exitCode = 1;
  })
  .finally(() => logSeparator('market-keeper:settle-pyth', 'END'));
