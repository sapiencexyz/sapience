/// <reference types="node" />

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  hexToBytes,
  http,
  isHex,
  keccak256,
  recoverAddress,
  sliceHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { contracts } from '../contracts/addresses';
import { getPythMarketHash, decodePythMarketId } from '../auction/encoding';

/**
 * Settle PythResolver conditions referenced by Sapience predictions.
 *
 * Selection rule:
 * - Discover candidate conditions whose `resolver` equals the PythResolver address.
 * - Parse market parameters from the condition's `description` field
 *   (format: PYTH_LAZER|priceId=...|endTime=...|strikePrice=...|strikeExpo=...|overWinsOnTie=...).
 * - Call `settleCondition` on the resolver with a Pyth Lazer price update.
 *
 * Safe by default: dry-run unless you pass `--execute`.
 *
 * Run (dry-run):
 *   pnpm --filter @sapience/sdk run settle:pyth -- \
 *     --rpc-url <RPC_URL> \
 *     --chain-id 5064014 \
 *     --graphql-url http://localhost:3001/graphql \
 *     --pyth-token "$PYTH_CONSUMER_TOKEN" \
 *     --dry-run
 *
 * Execute:
 *   pnpm --filter @sapience/sdk run settle:pyth -- \
 *     --rpc-url <RPC_URL> \
 *     --private-key <HEX_PRIVATE_KEY> \
 *     --chain-id 5064014 \
 *     --graphql-url http://localhost:3001/graphql \
 *     --pyth-token "$PYTH_CONSUMER_TOKEN" \
 *     --execute --wait
 *
 * Env var equivalents:
 * - RPC_URL (or BOT_RPC_URL)
 * - PRIVATE_KEY (or BOT_PRIVATE_KEY)
 * - PYTH_CONSUMER_TOKEN (or PYTH_API_KEY)
 * - GRAPHQL_URL
 */

type Args = {
  graphqlUrl: string;
  chainId: number;
  pythResolver: Address;
  conditionResolver: Address;
  rpcUrl: string;
  privateKey?: string;
  pythToken?: string;
  pythBaseUrl: string;
  maxConditions: number;
  fetchUpdates: boolean;
  pythDebug: boolean;
  dryRun: boolean;
  wait: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const idx = argv.findIndex((a) => a === `--${name}`);
    if (idx !== -1) return argv[idx + 1];
    const withEq = argv.find((a) => a.startsWith(`--${name}=`));
    if (withEq) return withEq.slice(`--${name}=`.length);
    return undefined;
  };
  const has = (name: string): boolean =>
    argv.includes(`--${name}`) || argv.some((a) => a === `--${name}=true`);

  const chainId = Number(
    get('chain-id') ??
      process.env.BOT_CHAIN_ID ??
      process.env.CHAIN_ID ??
      '5064014'
  );
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`invalid --chain-id (${String(get('chain-id'))})`);
  }

  const resolverFromSdk = contracts.pythConditionResolver?.[chainId]?.address;
  const pythResolverRaw = get('pyth-resolver') ?? resolverFromSdk;
  if (!pythResolverRaw) {
    throw new Error(
      `missing --pyth-resolver (no sdk entry for chainId=${chainId})`
    );
  }

  // Which resolver address to use when filtering `Condition.resolver` in GraphQL.
  // Defaults to `--pyth-resolver`, but in some environments the indexer stores
  // a different "canonical" resolver address on the Condition row.
  const conditionResolverRaw = get('condition-resolver') ?? pythResolverRaw;

  const rpcUrl =
    get('rpc-url') ?? process.env.BOT_RPC_URL ?? process.env.RPC_URL;
  if (!rpcUrl) throw new Error('missing --rpc-url (or BOT_RPC_URL/RPC_URL)');

  const graphqlUrl =
    get('graphql-url') ??
    process.env.GRAPHQL_URL ??
    'http://localhost:3001/graphql';

  const privateKey =
    get('private-key') ??
    process.env.BOT_PRIVATE_KEY ??
    process.env.PRIVATE_KEY;

  const pythToken =
    get('pyth-token') ??
    process.env.PYTH_CONSUMER_TOKEN ??
    process.env.PYTH_API_KEY ??
    undefined;

  const pythBaseUrl =
    get('pyth-base-url') ?? 'https://pyth-lazer.dourolabs.app';

  const maxConditions = Number(get('max-conditions') ?? '200');
  const fetchUpdates = !has('no-fetch-updates');
  const pythDebug = has('pyth-debug');

  return {
    graphqlUrl,
    chainId,
    pythResolver: getAddress(pythResolverRaw as Address),
    conditionResolver: getAddress(conditionResolverRaw as Address),
    rpcUrl,
    privateKey,
    pythToken,
    pythBaseUrl,
    maxConditions: Number.isFinite(maxConditions) ? maxConditions : 200,
    fetchUpdates,
    pythDebug,
    dryRun: has('dry-run') || !has('execute'),
    wait: has('wait'),
  };
}

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function gql<T>(
  graphqlUrl: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`
    );
  }
  if (!json.data) throw new Error('GraphQL: missing data');
  return json.data;
}

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

const PYTH_DEBUG_CONDITIONS_QUERY = /* GraphQL */ `
  query PythDebugConditions(
    $where: ConditionWhereInput
    $take: Int
    $skip: Int
  ) {
    conditions(where: $where, take: $take, skip: $skip) {
      id
      endTime
      chainId
      resolver
      question
      description
    }
  }
`;

type ConditionRow = {
  id: string;
  endTime: number;
  chainId: number;
  resolver?: string | null;
  description?: string | null;
  settled?: boolean;
};

type DebugConditionRow = ConditionRow & {
  question: string;
};

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

type Market = {
  priceId: Hex;
  endTime: bigint;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
};

// Market parameters are now decoded directly from the conditionId via decodePythMarketId().

function decodeFeedIdFromPriceId(priceId: Hex): number | null {
  try {
    const raw = BigInt(priceId);
    if (raw > 0xffff_ffffn) return null;
    return Number(raw);
  } catch {
    return null;
  }
}

function findHexStringsDeep(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]+$/.test(value)) out.push(value);
    // Also accept long bare-hex blobs (some APIs omit 0x prefix).
    if (
      /^[0-9a-fA-F]+$/.test(value) &&
      value.length >= 200 &&
      value.length % 2 === 0
    ) {
      out.push(`0x${value}`);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) findHexStringsDeep(v, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      findHexStringsDeep(v, out);
    }
  }
  return out;
}

type ParsedLazerPayload = {
  timestampUs: bigint;
  channel: number;
  feedsLen: number;
  feeds: Record<number, { price?: bigint; exponent?: number }>;
};

// Mirrors `PythLazerLibBytes` big-endian parsing.
function parseLazerPayload(payloadHex: Hex): ParsedLazerPayload {
  const b = hexToBytes(payloadHex);
  let pos = 0;
  const require = (n: number) => {
    if (pos + n > b.length) throw new Error('pyth_payload_oob');
  };
  const readU8 = () => {
    require(1);
    return b[pos++]!;
  };
  const readU16BE = () => {
    require(2);
    const v = (b[pos]! << 8) | b[pos + 1]!;
    pos += 2;
    return v;
  };
  const readU32BE = () => {
    require(4);
    const v =
      (b[pos]! << 24) | (b[pos + 1]! << 16) | (b[pos + 2]! << 8) | b[pos + 3]!;
    pos += 4;
    // Ensure unsigned
    return v >>> 0;
  };
  const readU64BE = () => {
    require(8);
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[pos + i]!);
    pos += 8;
    return v;
  };
  const readI64BE = () => BigInt.asIntN(64, readU64BE());
  const readI16BE = () => BigInt.asIntN(16, BigInt(readU16BE()));

  const FORMAT_MAGIC = 2479346549; // PythLazerLibBytes.FORMAT_MAGIC
  const magic = readU32BE();
  if (magic !== FORMAT_MAGIC) throw new Error('pyth_payload_bad_magic');

  const timestampUs = readU64BE();
  const channel = readU8();
  const feedsLen = readU8();

  const feeds: ParsedLazerPayload['feeds'] = {};
  for (let i = 0; i < feedsLen; i++) {
    const feedId = readU32BE();
    const numProps = readU8();
    const feed: { price?: bigint; exponent?: number } = {};

    for (let j = 0; j < numProps; j++) {
      const propId = readU8();
      // Property IDs: Price=0, BestBid=1, BestAsk=2, PublisherCount=3, Exponent=4, Confidence=5,
      // FundingRate=6, FundingTimestamp=7, FundingRateInterval=8, MarketSession=9
      if (propId === 0) {
        feed.price = readI64BE();
      } else if (propId === 4) {
        feed.exponent = Number(readI16BE());
      } else if (propId === 1 || propId === 2 || propId === 6) {
        // int64
        void readI64BE();
      } else if (propId === 3) {
        // uint16
        void readU16BE();
      } else if (propId === 5 || propId === 7 || propId === 8) {
        // uint64
        void readU64BE();
      } else if (propId === 9) {
        // market session u8
        void readU8();
      } else {
        throw new Error(`pyth_payload_unknown_property:${propId}`);
      }
    }

    feeds[feedId] = feed;
  }

  return { timestampUs, channel, feedsLen, feeds };
}

function decodeEvmBinaryToHex(data: string, encoding: string | null): Hex {
  const s = data.startsWith('0x') ? data : `0x${data}`;
  if (encoding === 'hex' || encoding === null) {
    if (!isHex(s)) throw new Error('pyth_evm_blob_not_hex');
    return s as Hex;
  }
  if (encoding === 'base64') {
    const bytes = Buffer.from(data, 'base64');
    return `0x${bytes.toString('hex')}` as Hex;
  }
  // Fall back: try hex anyway.
  if (isHex(s)) return s as Hex;
  throw new Error(`pyth_evm_blob_unknown_encoding:${encoding}`);
}

async function recoverSignerFromLazerUpdate(
  update: Hex
): Promise<Address | null> {
  try {
    // Layout per fork test + upstream verifier:
    // [0:4] magic
    // [4:36] r
    // [36:68] s
    // [68] v (0/1)
    // [69:71] payload_len (uint16 BE)
    // [71:71+payload_len] payload
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

/** Loose shape of Pyth Lazer JSON responses for type-safe property access. */
interface PythEvmResponse {
  evm?: { data?: unknown; encoding?: unknown };
  data?: { evm?: { data?: unknown; encoding?: unknown } };
}

function extractEvmBlobFromJson(json: unknown): { blob: Hex; source: string } {
  const j = json as PythEvmResponse;

  // Common shapes observed across similar services:
  // - { evm: { data: "0x..", encoding: "hex" } }
  // - { evm: { data: ["0x.."], encoding: "hex" } }
  // - { data: { evm: { ... } } }
  const candidates: Array<{
    data: string;
    encoding: string | null;
    source: string;
  }> = [];

  const pushIfString = (val: unknown, encoding: unknown, source: string) => {
    if (typeof val === 'string') {
      candidates.push({
        data: val,
        encoding: typeof encoding === 'string' ? encoding : null,
        source,
      });
    }
  };
  const pushIfStringArray = (
    val: unknown,
    encoding: unknown,
    source: string
  ) => {
    if (Array.isArray(val) && val.every((x) => typeof x === 'string')) {
      for (let i = 0; i < val.length; i++) {
        candidates.push({
          data: val[i] as string,
          encoding: typeof encoding === 'string' ? encoding : null,
          source: `${source}[${i}]`,
        });
      }
    }
  };

  pushIfString(j?.evm?.data, j?.evm?.encoding, 'evm.data');
  pushIfStringArray(j?.evm?.data, j?.evm?.encoding, 'evm.data');
  pushIfString(j?.data?.evm?.data, j?.data?.evm?.encoding, 'data.evm.data');
  pushIfStringArray(
    j?.data?.evm?.data,
    j?.data?.evm?.encoding,
    'data.evm.data'
  );

  // Fallback: scan all hex strings deep, prefer very long blobs.
  if (candidates.length === 0) {
    const hexes = findHexStringsDeep(json);
    // Filter out likely addresses / small fields.
    const big = [...new Set(hexes)].filter((h) => h.length >= 2 + 200);
    for (const h of big)
      candidates.push({ data: h, encoding: 'hex', source: 'deep-scan' });
  }

  if (candidates.length === 0) {
    throw new Error('pyth_response_missing_evm_blob');
  }

  // Prefer the longest unique blob (addresses/ids can appear too).
  const normalized = candidates
    .map((c) => ({
      ...c,
      // keep original `data` for base64; for hex normalize prefix
      key:
        c.encoding === 'base64'
          ? `b64:${c.data}`
          : `hex:${c.data.startsWith('0x') ? c.data : `0x${c.data}`}`,
    }))
    .filter((c) => c.data.length > 0);
  const byKey = new Map<string, (typeof normalized)[number]>();
  for (const c of normalized) {
    const prev = byKey.get(c.key);
    if (!prev || c.data.length > prev.data.length) byKey.set(c.key, c);
  }
  const unique = [...byKey.values()].sort(
    (a, b) => b.data.length - a.data.length
  );

  const best = unique[0]!;
  const blob = decodeEvmBinaryToHex(best.data, best.encoding);
  return { blob, source: best.source };
}

async function fetchPythLazerEvmUpdateBlob(args: {
  pythBaseUrl: string;
  token?: string;
  feedId: number;
  endTimeSec: number;
  debug?: boolean;
}): Promise<Hex> {
  const base = args.pythBaseUrl.replace(/\/$/, '');

  // PythResolver requires exact-second publishTime.
  // Lazer timestamps are microseconds, so we request endTimeSec * 1_000_000.
  const timestampUsNum = args.endTimeSec * 1_000_000;

  // Per guide: channel should be "real_time", "fixed_rate@200ms", or "fixed_rate@50ms".
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
      // Base64 is the canonical example in the guide; we decode -> hex for on-chain.
      jsonBinaryEncoding: 'base64',
    });
  }

  // Per docs: token can be sent either as Authorization: Bearer <token> OR URL param ACCESS_TOKEN.
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
        const res = await fetch(v.url, {
          method: 'POST',
          headers: v.headers,
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (args.debug && !res.ok) {
          const channel =
            'channel' in body && typeof body.channel === 'string'
              ? body.channel
              : '(none)';
          console.log(
            `[settle:pyth][pyth-debug] ${res.status} auth=${v.label} channel=${channel} url=${v.url} resp=${text.slice(0, 200)} req=${JSON.stringify(
              body
            ).slice(0, 200)}`
          );
        }
        if (!res.ok) throw new Error(`Pyth Lazer ${res.status}: ${text}`);

        let json: unknown;
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          throw new Error(
            `Pyth Lazer non-JSON response: ${text.slice(0, 200)}`
          );
        }

        const { blob, source } = extractEvmBlobFromJson(json);
        if (args.debug) {
          console.log(
            `[settle:pyth][pyth-debug] got evm blob via ${source} len=${blob.length} auth=${v.label}`
          );
        }
        return blob;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw new Error(
    `Failed to fetch Pyth Lazer evm blob for feedId=${args.feedId} endTimeSec=${args.endTimeSec} timestampUs=${timestampUsNum}: ${
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowSec = Math.floor(Date.now() / 1000);

  console.log('[settle:pyth] graphql=', args.graphqlUrl);
  console.log('[settle:pyth] chainId=', args.chainId);
  console.log('[settle:pyth] pythResolver=', args.pythResolver);
  console.log(
    '[settle:pyth] conditionResolver(filter)=',
    args.conditionResolver
  );
  console.log(
    '[settle:pyth] fetchUpdates=',
    args.fetchUpdates,
    'pythDebug=',
    args.pythDebug
  );
  console.log('[settle:pyth] dryRun=', args.dryRun, 'wait=', args.wait);

  const publicClient = createPublicClient({ transport: http(args.rpcUrl) });
  const walletClient =
    args.dryRun || !args.privateKey
      ? null
      : createWalletClient({
          account: privateKeyToAccount(
            `0x${args.privateKey.replace(/^0x/, '')}`
          ),
          chain: {
            id: args.chainId,
            name: 'custom',
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [args.rpcUrl] } },
          },
          transport: http(args.rpcUrl),
        });

  const pythLazer = (await publicClient.readContract({
    address: args.pythResolver,
    abi: pythResolverAbi,
    functionName: 'pythLazer',
  })) as Address;

  const verificationFee = (await publicClient.readContract({
    address: pythLazer,
    abi: pythLazerAbi,
    functionName: 'verification_fee',
  })) as bigint;

  console.log('[settle:pyth] pythLazer=', pythLazer);
  console.log('[settle:pyth] verification_fee=', verificationFee.toString());

  // 1) Find ended, unsettled conditions whose resolver is this PythResolver.
  const conditions: ConditionRow[] = [];
  for (let skip = 0; conditions.length < args.maxConditions; skip += 50) {
    const take = Math.min(50, args.maxConditions - conditions.length);
    const data = await gql<{ conditions: ConditionRow[] }>(
      args.graphqlUrl,
      CONDITIONS_QUERY,
      {
        where: {
          chainId: { equals: args.chainId },
          endTime: { lte: nowSec },
          settled: { equals: false },
          resolver: { equals: args.conditionResolver, mode: 'insensitive' },
        },
        take,
        skip,
      }
    );
    if (data.conditions.length === 0) break;
    conditions.push(...data.conditions);
  }

  console.log(
    '[settle:pyth] ended unsettled resolver-matched conditions=',
    conditions.length
  );

  // If we found none, print a small debug sample to help diagnose DB/indexer mismatch.
  if (conditions.length === 0) {
    try {
      const dbg = await gql<{ conditions: DebugConditionRow[] }>(
        args.graphqlUrl,
        PYTH_DEBUG_CONDITIONS_QUERY,
        {
          where: {
            chainId: { equals: args.chainId },
            endTime: { lte: nowSec },
            question: { contains: 'PYTH', mode: 'insensitive' },
          },
          take: 10,
          skip: 0,
        }
      );

      const rows = dbg.conditions ?? [];
      if (rows.length === 0) {
        console.log(
          '[settle:pyth][debug] No ended PYTH:* conditions found either. Check chain-id / indexer coverage.'
        );
      } else {
        console.log(
          `[settle:pyth][debug] Found ${rows.length} ended PYTH:* condition(s). Here are their stored resolver values:`
        );
        for (const r of rows) {
          const label =
            r.question?.trim()?.length > 0 ? r.question.trim() : r.id;
          console.log(
            `  - condition=${r.id} endTime=${r.endTime} resolver=${r.resolver ?? 'null'} settled=${r.settled ?? 'unknown'} label=${label}`
          );
        }
        console.log(
          '[settle:pyth][debug] If these resolvers are NOT the PythResolver address, rerun with `--condition-resolver <that-address>`.'
        );
      }
    } catch (e) {
      console.log(
        '[settle:pyth][debug] Failed to fetch debug PYTH conditions:',
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // 2) Decode market parameters from each condition's conditionId (ABI-encoded).
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
      `[settle:pyth] skipped ${skippedDecode} conditions with non-decodable conditionId`
    );
  }
  console.log('[settle:pyth] unique markets=', marketsById.size);

  // 3) Settle each market if not already settled in the resolver.
  let attempted = 0;
  let submitted = 0;

  for (const [marketId, market] of marketsById.entries()) {
    const s = (await publicClient.readContract({
      address: args.pythResolver,
      abi: pythResolverAbi,
      functionName: 'settlements',
      args: [marketId],
    })) as readonly [boolean, boolean, bigint, number, bigint];

    const alreadySettled = s[0];
    if (alreadySettled) continue;

    const endTimeSec = Number(market.endTime);
    const feedId = decodeFeedIdFromPriceId(market.priceId);
    if (typeof feedId !== 'number') {
      console.warn('[settle:pyth] skip market (non-lazer priceId):', marketId);
      continue;
    }

    attempted++;
    console.log(
      `[settle:pyth] market=${marketId} feedId=${feedId} endTime=${endTimeSec}`
    );

    if (!args.fetchUpdates) {
      console.log('[settle:pyth] skipping update fetch (--no-fetch-updates)');
      continue;
    }

    let blob: Hex;
    try {
      blob = await fetchPythLazerEvmUpdateBlob({
        pythBaseUrl: args.pythBaseUrl,
        token: args.pythToken,
        feedId,
        endTimeSec,
        debug: args.pythDebug,
      });
    } catch (e) {
      console.warn(
        `[settle:pyth] skip market (failed to fetch update): market=${marketId} feedId=${feedId} endTime=${endTimeSec} reason=${
          e instanceof Error ? e.message : String(e)
        }`
      );
      continue;
    }

    // Preflight: verify the update blob against the on-chain verifier and validate timestamp/exponent
    // before attempting resolver settlement.
    try {
      const sim = await publicClient.simulateContract({
        address: pythLazer,
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

      if (args.pythDebug) {
        console.log(
          `[settle:pyth][pyth-debug] verified publishTimeSec=${publishTimeSec} secondAligned=${isSecondAligned} feedExpo=${String(
            expo
          )}`
        );
      }

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
        `[settle:pyth] skip market (update preflight failed): market=${marketId} recoveredSigner=${recovered ?? 'unknown'} reason=${
          e instanceof Error ? e.message : String(e)
        }`
      );
      continue;
    }

    if (args.dryRun) {
      console.log(
        '[settle:pyth] dry-run: would call settleCondition (value=',
        verificationFee.toString(),
        ')'
      );
      continue;
    }
    if (!walletClient) throw new Error('wallet client not configured');

    const hash = await walletClient.writeContract({
      address: args.pythResolver,
      abi: pythResolverAbi,
      functionName: 'settleCondition',
      args: [market, [blob]],
      value: verificationFee,
    });
    console.log('[settle:pyth] tx sent', hash);
    submitted++;

    if (args.wait) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log('[settle:pyth] tx mined', receipt.transactionHash);
    }
  }

  console.log(
    '[settle:pyth] done attempted=',
    attempted,
    'submitted=',
    submitted
  );
}

main().catch((e) => {
  console.error('[settle:pyth] fatal:', e);
  process.exitCode = 1;
});
