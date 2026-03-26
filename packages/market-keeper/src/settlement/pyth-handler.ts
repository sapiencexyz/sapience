/**
 * Pyth settlement handler.
 *
 * Decodes market parameters from conditionId, fetches signed price data from
 * Pyth Lazer, runs preflight verification, and calls settleCondition on-chain.
 */

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
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  pythConditionResolver,
  getPythMarketHash,
  decodePythMarketId,
} from '@sapience/sdk';
import { fetchWithRetry } from '../utils/fetch.js';
import {
  decodeFeedIdFromPriceId,
  extractEvmBlobFromJson,
  parseLazerPayload,
  type Market,
} from '../pyth.js';
import type {
  CLIOptions,
  SapienceCondition,
  SettlementHandler,
  SettlementResult,
} from './types.js';

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

// ============ Chain Definition ============

const etherealChain = defineChain({
  id: CHAIN_ID,
  name: 'Ethereal',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_RPC] },
  },
});

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

// ============ Pyth Lazer Fetch ============

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
    'fixed_rate@1000ms',
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
          3,
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
        ? ` (lastAttempt auth=${lastAttempt.auth} url=${lastAttempt.url} body=${JSON.stringify(lastBody).slice(0, 200)})`
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

// ============ Handler ============

export class PythSettlementHandler implements SettlementHandler {
  readonly name = 'pyth';

  private publicClient!: ReturnType<typeof createPublicClient>;
  private walletClient: WalletClient<Transport, Chain, Account> | null = null;
  private pythLazerAddress!: Address;
  private verificationFee!: bigint;

  isConfigured(): boolean {
    if (!PYTH_CONSUMER_TOKEN) {
      console.log('[pyth] PYTH_CONSUMER_TOKEN not set, Pyth settlement disabled');
      return false;
    }
    if (!PYTH_RESOLVER_ADDRESS || PYTH_RESOLVER_ADDRESS === '0x') {
      console.log(
        `[pyth] No PythConditionResolver address for chainId=${CHAIN_ID}`
      );
      return false;
    }
    return true;
  }

  async init(options: CLIOptions): Promise<void> {
    const privateKey = process.env.ADMIN_PRIVATE_KEY;

    this.publicClient = createPublicClient({
      chain: etherealChain,
      transport: http(ETHEREAL_RPC),
    });

    if (privateKey && !options.dryRun) {
      this.walletClient = createWalletClient({
        account: privateKeyToAccount(
          (privateKey.startsWith('0x')
            ? privateKey
            : `0x${privateKey}`) as Hex
        ),
        chain: etherealChain,
        transport: http(ETHEREAL_RPC),
      });

      const balance = await this.publicClient.getBalance({
        address: this.walletClient!.account.address,
      });
      console.log(
        `[pyth] Ethereal wallet ${this.walletClient!.account.address} balance: ${formatEther(balance)} ETH`
      );
    }

    // Read on-chain PythLazer address and verification fee
    this.pythLazerAddress = (await this.publicClient.readContract({
      address: getAddress(PYTH_RESOLVER_ADDRESS),
      abi: pythResolverAbi,
      functionName: 'pythLazer',
    })) as Address;

    this.verificationFee = (await this.publicClient.readContract({
      address: this.pythLazerAddress,
      abi: pythLazerAbi,
      functionName: 'verification_fee',
    })) as bigint;

    console.log(`[pyth] resolver=${PYTH_RESOLVER_ADDRESS}`);
    console.log(`[pyth] pythLazer=${this.pythLazerAddress}`);
    console.log(
      `[pyth] verification_fee=${this.verificationFee.toString()} wei`
    );
  }

  async settle(
    condition: SapienceCondition,
    options: CLIOptions
  ): Promise<SettlementResult> {
    const conditionId = condition.id as Hex;

    try {
      // Step 1: Decode market parameters from conditionId
      const market = decodePythMarketId(conditionId);
      if (!market) {
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
          error: 'Failed to decode Pyth market from conditionId',
        };
      }

      const marketId = getPythMarketHash(market);

      // Step 2: Check if already settled on-chain
      try {
        const settlement = (await this.publicClient.readContract({
          address: getAddress(PYTH_RESOLVER_ADDRESS),
          abi: pythResolverAbi,
          functionName: 'settlements',
          args: [marketId],
        })) as readonly [boolean, boolean, bigint, number, bigint];

        if (settlement[0]) {
          console.log(`[pyth][${marketId}] Already settled`);
          return {
            conditionId,
            resolverType: 'pyth',
            alreadyResolved: true,
            canResolve: false,
            settled: false,
          };
        }
      } catch (e) {
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
          error: `Error checking settlement: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      // Step 3: Fetch signed price update from Pyth Lazer
      const feedId = decodeFeedIdFromPriceId(market.priceId);
      if (typeof feedId !== 'number') {
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
          error: `Non-lazer priceId: ${market.priceId}`,
        };
      }

      const endTimeSec = Number(market.endTime);
      console.log(
        `[pyth][${marketId}] feedId=${feedId} endTime=${endTimeSec}`
      );

      let blob: Hex;
      try {
        blob = await fetchPythLazerEvmUpdateBlob({
          pythBaseUrl: PYTH_BASE_URL,
          token: PYTH_CONSUMER_TOKEN,
          feedId,
          endTimeSec,
        });
      } catch (e) {
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
          error: `Failed to fetch Pyth update: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      // Step 4: Preflight verification
      try {
        const sim = await this.publicClient.simulateContract({
          address: this.pythLazerAddress,
          abi: pythLazerAbi,
          functionName: 'verifyUpdate',
          args: [blob],
          value: this.verificationFee,
        });
        const [payload] = sim.result as unknown as readonly [Hex, Address];
        const parsed = parseLazerPayload(payload);
        const publishTimeSec = Number(parsed.timestampUs / 1_000_000n);
        const isSecondAligned = parsed.timestampUs % 1_000_000n === 0n;
        const feed = parsed.feeds[feedId];
        const expo = feed?.exponent;

        if (!isSecondAligned)
          throw new Error('preflight_not_second_aligned');
        if (publishTimeSec !== endTimeSec)
          throw new Error(
            `preflight_publish_time_mismatch:${publishTimeSec}!=${endTimeSec}`
          );
        if (typeof expo !== 'number')
          throw new Error('preflight_missing_exponent');
        if (expo !== market.strikeExpo)
          throw new Error(
            `preflight_exponent_mismatch:${expo}!=${market.strikeExpo}`
          );
      } catch (e) {
        const recovered = await recoverSignerFromLazerUpdate(blob);
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
          error: `Preflight failed (signer=${recovered ?? 'unknown'}): ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      if (options.dryRun) {
        console.log(
          `[pyth][${marketId}] DRY RUN — would call settleCondition (value=${this.verificationFee.toString()} wei)`
        );
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: true,
          settled: false,
        };
      }

      if (!this.walletClient) {
        return {
          conditionId,
          resolverType: 'pyth',
          alreadyResolved: false,
          canResolve: true,
          settled: false,
          error: 'No wallet client (missing ADMIN_PRIVATE_KEY)',
        };
      }

      // Step 5: Send settleCondition on-chain
      console.log(`[pyth][${marketId}] Sending settleCondition...`);
      const hash = await this.walletClient.writeContract({
        address: getAddress(PYTH_RESOLVER_ADDRESS),
        abi: pythResolverAbi,
        functionName: 'settleCondition',
        args: [market, [blob]],
        value: this.verificationFee,
      });
      console.log(`[pyth][${marketId}] Transaction sent: ${hash}`);

      if (options.wait) {
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash,
        });
        console.log(
          `[pyth][${marketId}] Confirmed in block ${receipt.blockNumber}`
        );
      }

      return {
        conditionId,
        resolverType: 'pyth',
        alreadyResolved: false,
        canResolve: true,
        settled: true,
        txHash: hash,
      };
    } catch (error) {
      return {
        conditionId,
        resolverType: 'pyth',
        alreadyResolved: false,
        canResolve: false,
        settled: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
