/// <reference types="node" />

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  getAddress,
  http,
  isHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { contracts } from '../contracts/addresses';
import { getPythMarketId } from '../auction/encoding';

/**
 * Settles PythResolver markets for ended positions by:
 * - Querying GraphQL for ended conditions (by `Condition.resolver`)
 * - Fetching positions for those conditions
 * - Reading `PredictionMarket.getPrediction(tokenId)` to decode legs
 * - Calling `PythResolver.settleMarket`
 *
 * Defaults to dry-run unless you pass `--execute`.
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
  maxPositionsPerCondition: number;
  positionStatus?: string;
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
    get('chain-id') ?? process.env.BOT_CHAIN_ID ?? process.env.CHAIN_ID ?? '5064014'
  );
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`invalid --chain-id (${String(get('chain-id'))})`);
  }

  const resolverFromSdk = contracts.pythResolver?.[chainId]?.address;
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
    get('private-key') ?? process.env.BOT_PRIVATE_KEY ?? process.env.PRIVATE_KEY;

  const pythToken =
    get('pyth-token') ??
    process.env.PYTH_CONSUMER_TOKEN ??
    process.env.PYTH_API_KEY ??
    undefined;

  const pythBaseUrl = get('pyth-base-url') ?? 'https://pyth-lazer.dourolabs.app';

  const maxConditions = Number(get('max-conditions') ?? '200');
  const maxPositionsPerCondition = Number(get('max-positions') ?? '200');
  const positionStatus = get('position-status') ?? 'active';

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
    maxPositionsPerCondition: Number.isFinite(maxPositionsPerCondition)
      ? maxPositionsPerCondition
      : 200,
    positionStatus: positionStatus === 'any' ? undefined : positionStatus,
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
  query ResolverConditions($where: ConditionWhereInput, $take: Int, $skip: Int) {
    conditions(where: $where, take: $take, skip: $skip) {
      id
      endTime
      chainId
      resolver
    }
  }
`;

const PYTH_DEBUG_CONDITIONS_QUERY = /* GraphQL */ `
  query PythDebugConditions($where: ConditionWhereInput, $take: Int, $skip: Int) {
    conditions(where: $where, take: $take, skip: $skip) {
      id
      endTime
      chainId
      resolver
      claimStatement
      question
    }
  }
`;

const POSITIONS_BY_CONDITION_QUERY = /* GraphQL */ `
  query PositionsByCondition(
    $conditionId: String!
    $take: Int!
    $skip: Int!
    $chainId: Int
    $status: String
  ) {
    positionsByConditionId(
      conditionId: $conditionId
      take: $take
      skip: $skip
      chainId: $chainId
      status: $status
    ) {
      id
      chainId
      marketAddress
      predictorNftTokenId
      counterpartyNftTokenId
      status
      endsAt
    }
  }
`;

const CONDITION_WITH_PREDICTIONS_DEBUG_QUERY = /* GraphQL */ `
  query ConditionDebug($id: String!) {
    condition(where: { id: $id }) {
      id
      endTime
      chainId
      resolver
      claimStatement
      question
      predictions(take: 20) {
        id
        chainId
        outcomeYes
        position {
          id
          chainId
          status
          endsAt
          marketAddress
          predictorNftTokenId
          counterpartyNftTokenId
        }
        limitOrder {
          id
          chainId
          status
          orderId
          marketAddress
        }
      }
    }
  }
`;

type ConditionRow = {
  id: string;
  endTime: number;
  chainId: number;
  resolver?: string | null;
};

type DebugConditionRow = ConditionRow & {
  claimStatement: string;
  question: string;
};

type PositionRow = {
  id: number;
  chainId: number;
  marketAddress: string;
  predictorNftTokenId: string;
  counterpartyNftTokenId: string;
  status: 'active' | 'settled' | 'consolidated';
  endsAt?: number | null;
};

const predictionMarketAbi = [
  {
    type: 'function',
    name: 'getPrediction',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'predictionData',
        type: 'tuple',
        components: [
          { name: 'predictionId', type: 'uint256' },
          { name: 'makerNftTokenId', type: 'uint256' },
          { name: 'takerNftTokenId', type: 'uint256' },
          { name: 'makerCollateral', type: 'uint256' },
          { name: 'takerCollateral', type: 'uint256' },
          { name: 'encodedPredictedOutcomes', type: 'bytes' },
          { name: 'resolver', type: 'address' },
          { name: 'maker', type: 'address' },
          { name: 'taker', type: 'address' },
          { name: 'settled', type: 'bool' },
          { name: 'makerWon', type: 'bool' },
        ],
      },
    ],
  },
] as const;

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
    name: 'settleMarket',
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
      { name: 'marketId', type: 'bytes32' },
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
] as const;

type DecodedOutcome = {
  priceId: Hex;
  endTime: bigint;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
  prediction: boolean;
};

type Market = Omit<DecodedOutcome, 'prediction'>;

function decodeOutcomes(encoded: Hex): DecodedOutcome[] {
  const [outcomes] = decodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'priceId', type: 'bytes32' },
          { name: 'endTime', type: 'uint64' },
          { name: 'strikePrice', type: 'int64' },
          { name: 'strikeExpo', type: 'int32' },
          { name: 'overWinsOnTie', type: 'bool' },
          { name: 'prediction', type: 'bool' },
        ],
      },
    ],
    encoded
  ) as unknown as [Array<[Hex, bigint, bigint, number, boolean, boolean]>];

  return outcomes.map(
    ([priceId, endTime, strikePrice, strikeExpo, overWinsOnTie, prediction]) => ({
      priceId,
      endTime,
      strikePrice,
      strikeExpo: Number(strikeExpo),
      overWinsOnTie,
      prediction,
    })
  );
}

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

async function fetchPythLazerEvmUpdateBlob(args: {
  pythBaseUrl: string;
  token?: string;
  feedId: number;
  endTimeSec: number;
}): Promise<Hex> {
  const base = args.pythBaseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/v1/price`);
  url.searchParams.append('priceFeedIds[]', String(args.feedId));
  url.searchParams.append('properties[]', 'price');
  url.searchParams.append('properties[]', 'exponent');
  url.searchParams.append('formats[]', 'evm');
  url.searchParams.append('channel', 'fixed_rate@50ms');
  url.searchParams.append('jsonBinaryEncoding', 'hex');

  const timeVariants: Array<[string, string]> = [
    ['timestamp', String(args.endTimeSec)],
    ['timestamp', String(args.endTimeSec * 1_000_000)],
    ['publishTime', String(args.endTimeSec)],
    ['publish_time', String(args.endTimeSec)],
    ['publishTimeSec', String(args.endTimeSec)],
    ['publish_time_sec', String(args.endTimeSec)],
    ['endTime', String(args.endTimeSec)],
  ];

  const headerVariants: Array<Record<string, string>> = [
    {},
    args.token ? { Authorization: `Bearer ${args.token}` } : {},
    args.token ? { 'x-api-key': args.token } : {},
    args.token ? { 'x-consumer-token': args.token } : {},
  ];

  const queryTokenVariants: Array<[string, string] | null> = args.token
    ? [
        ['consumerToken', args.token],
        ['consumer_token', args.token],
        ['token', args.token],
      ]
    : [null];

  let lastErr: unknown = null;

  for (const [timeKey, timeVal] of timeVariants) {
    for (const qTok of queryTokenVariants) {
      for (const headers of headerVariants) {
        const u = new URL(url.toString());
        u.searchParams.set(timeKey, timeVal);
        if (qTok) u.searchParams.set(qTok[0], qTok[1]);

        try {
          const res = await fetch(u, { method: 'GET', headers });
          const text = await res.text();
          if (!res.ok) throw new Error(`Pyth Lazer ${res.status}: ${text}`);

          let blob: string | null = null;
          try {
            const json = JSON.parse(text) as unknown;
            const hexes = findHexStringsDeep(json);
            blob =
              hexes
                .filter((h) => h.length > 2)
                .sort((a, b) => b.length - a.length)[0] ?? null;
          } catch {
            blob = text.trim();
          }

          if (!blob || !isHex(blob)) {
            throw new Error(
              `Pyth Lazer response did not contain hex blob (got ${text.slice(0, 200)})`
            );
          }
          return blob as Hex;
        } catch (e) {
          lastErr = e;
        }
      }
    }
  }

  throw new Error(
    `Failed to fetch Pyth Lazer evm blob for feedId=${args.feedId} endTimeSec=${args.endTimeSec}: ${String(
      (lastErr as any)?.message ?? lastErr
    )}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowSec = Math.floor(Date.now() / 1000);

  console.log('[settle:pyth] graphql=', args.graphqlUrl);
  console.log('[settle:pyth] chainId=', args.chainId);
  console.log('[settle:pyth] pythResolver=', args.pythResolver);
  console.log('[settle:pyth] conditionResolver(filter)=', args.conditionResolver);
  console.log('[settle:pyth] positionStatus(filter)=', args.positionStatus ?? '(any)');
  console.log('[settle:pyth] dryRun=', args.dryRun, 'wait=', args.wait);

  const publicClient = createPublicClient({ transport: http(args.rpcUrl) });
  const walletClient =
    args.dryRun || !args.privateKey
      ? null
      : createWalletClient({
          account: privateKeyToAccount(`0x${args.privateKey.replace(/^0x/, '')}`),
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

  // 1) Find ended conditions whose resolver is this PythResolver.
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
          resolver: { equals: args.conditionResolver, mode: 'insensitive' },
        },
        take,
        skip,
      }
    );
    if (data.conditions.length === 0) break;
    conditions.push(...data.conditions);
  }

  console.log('[settle:pyth] ended resolver-matched conditions=', conditions.length);

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
            claimStatement: { startsWith: 'PYTH:' },
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
            r.question?.trim()?.length > 0 ? r.question.trim() : r.claimStatement;
          console.log(
            `  - condition=${r.id} endTime=${r.endTime} resolver=${r.resolver ?? 'null'} label=${label}`
          );
        }
        console.log(
          '[settle:pyth][debug] If these resolvers are NOT the PythResolver address, rerun with `--condition-resolver <that-address>`.'
        );

        // Also show whether the condition has Positions or only LimitOrders.
        const first = rows[0];
        if (first?.id) {
          const dbg2 = await gql<{ condition: any }>(
            args.graphqlUrl,
            CONDITION_WITH_PREDICTIONS_DEBUG_QUERY,
            { id: first.id }
          );
          const c = dbg2.condition;
          if (c) {
            const posCount = (c.predictions ?? []).filter((p: any) => !!p.position).length;
            const loCount = (c.predictions ?? []).filter((p: any) => !!p.limitOrder).length;
            console.log(
              `[settle:pyth][debug] condition=${c.id} predictions=${(c.predictions ?? []).length} withPosition=${posCount} withLimitOrder=${loCount}`
            );
          }
        }
      }
    } catch (e) {
      console.log(
        '[settle:pyth][debug] Failed to fetch debug PYTH conditions:',
        String((e as any)?.message ?? e)
      );
    }
  }

  // 2) For each condition, pull active positions.
  const positions: PositionRow[] = [];
  for (const c of conditions) {
    const data = await gql<{ positionsByConditionId: PositionRow[] }>(
      args.graphqlUrl,
      POSITIONS_BY_CONDITION_QUERY,
      {
        conditionId: c.id,
        take: args.maxPositionsPerCondition,
        skip: 0,
        chainId: args.chainId,
        status: args.positionStatus ?? null,
      }
    );
    for (const p of data.positionsByConditionId) {
      if (p.endsAt && p.endsAt > nowSec) continue;
      positions.push(p);
    }
  }

  const uniquePositionKeys = new Set<string>();
  const uniquePositions = positions.filter((p) => {
    const k = `${p.chainId}:${p.marketAddress.toLowerCase()}:${p.predictorNftTokenId}`;
    if (uniquePositionKeys.has(k)) return false;
    uniquePositionKeys.add(k);
    return true;
  });

  console.log('[settle:pyth] candidate positions=', uniquePositions.length);

  // 3) Read onchain `encodedPredictedOutcomes` and build unique market list.
  const marketsById = new Map<Hex, Market>();
  for (const p of uniquePositions) {
    const marketAddress = getAddress(p.marketAddress as Address);
    const tokenId = BigInt(p.predictorNftTokenId);

    const pred = (await publicClient.readContract({
      address: marketAddress,
      abi: predictionMarketAbi,
      functionName: 'getPrediction',
      args: [tokenId],
    })) as any;

    if (pred.settled) continue;
    const predResolver = getAddress(pred.resolver as Address);
    if (predResolver.toLowerCase() !== args.pythResolver.toLowerCase()) continue;

    const encoded = pred.encodedPredictedOutcomes as Hex;
    const decoded = decodeOutcomes(encoded);
    for (const o of decoded) {
      const market: Market = {
        priceId: o.priceId,
        endTime: o.endTime,
        strikePrice: o.strikePrice,
        strikeExpo: o.strikeExpo,
        overWinsOnTie: o.overWinsOnTie,
      };
      const marketId = getPythMarketId(market);
      marketsById.set(marketId, market);
    }
  }

  console.log('[settle:pyth] unique markets=', marketsById.size);

  // 4) Settle each market if not already settled in the resolver.
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

    const blob = await fetchPythLazerEvmUpdateBlob({
      pythBaseUrl: args.pythBaseUrl,
      token: args.pythToken,
      feedId,
      endTimeSec,
    });

    if (args.dryRun) {
      console.log(
        '[settle:pyth] dry-run: would call settleMarket (value=',
        verificationFee.toString(),
        ')'
      );
      continue;
    }
    if (!walletClient) throw new Error('wallet client not configured');

    const hash = await walletClient.writeContract({
      address: args.pythResolver,
      abi: pythResolverAbi,
      functionName: 'settleMarket',
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

  console.log('[settle:pyth] done attempted=', attempted, 'submitted=', submitted);
}

main().catch((e) => {
  console.error('[settle:pyth] fatal:', e);
  process.exitCode = 1;
});
