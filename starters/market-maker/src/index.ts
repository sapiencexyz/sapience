import 'dotenv/config';
import WebSocket from 'ws';
import type { RawData } from 'ws';
import { loadSdk } from './sdk.js';
import { parseEther, decodeAbiParameters, createPublicClient, createWalletClient, erc20Abi, http, getAddress, type Address, type Hex, type Chain } from 'viem';
import { graphqlRequest } from '@sapience/sdk/queries';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, base, optimism, mainnet, polygon } from 'viem/chains';

// Minimal ANSI color helpers for readable logs
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const color = (text: string, ...codes: string[]) => `${codes.join('')}${text}${ANSI.reset}`;

const logger = {
  info: (msg: string, ...args: any[]) => console.log(color(msg, ANSI.bold, ANSI.cyan), ...args),
  success: (msg: string, ...args: any[]) => console.log(color(msg, ANSI.bold, ANSI.green), ...args),
  warn: (msg: string, ...args: any[]) => console.warn(color(msg, ANSI.bold, ANSI.yellow), ...args),
  error: (msg: string, ...args: any[]) => console.error(color(msg, ANSI.bold, ANSI.red), ...args),
  dim: (msg: string) => color(msg, ANSI.dim),
};

const fmt = {
  value: (s: string) => color(s, ANSI.bold, ANSI.magenta),
  id: (s: string) => color(s, ANSI.bold, ANSI.cyan),
  yes: (s = 'Yes') => color(s, ANSI.bold, ANSI.green),
  no: (s = 'No') => color(s, ANSI.bold, ANSI.red),
  field: (name: string, val: string) => `${color(`${name}:`, ANSI.gray)} ${val}`,
  bullet: (s: string) => `  - ${s}`,
};

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

const RELAYER_WS_URL = process.env.RELAYER_WS_URL || 'wss://api.sapience.xyz/auction';

// Default chain is Arbitrum One (42161)
const CHAIN_ID = Number(process.env.CHAIN_ID || '42161');

const chainsById: Record<number, Chain> = {
  [arbitrum.id]: arbitrum,
  [base.id]: base,
  [optimism.id]: optimism,
  [mainnet.id]: mainnet,
  [polygon.id]: polygon,
};
const CHAIN_NAME: string = chainsById[CHAIN_ID]?.name || String(CHAIN_ID);
const DEFAULT_RPC = chainsById[CHAIN_ID]?.rpcUrls?.public?.http?.[0] || chainsById[CHAIN_ID]?.rpcUrls?.default?.http?.[0];
const RPC_URL = getEnv('RPC_URL', DEFAULT_RPC);
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim() || undefined;
const PRIVATE_KEY_HEX = PRIVATE_KEY
  ? ((PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`) as Hex)
  : undefined;

const sdk = await loadSdk();
type ContractsMap = typeof import('@sapience/sdk/contracts').contracts;
type BuildTakerBidTypedData = typeof import('@sapience/sdk/auction/signing').buildTakerBidTypedData;
type SignTakerBid = typeof import('@sapience/sdk/auction/signing').signTakerBid;
const addressBook = sdk.contracts as ContractsMap;
const buildTakerBidTypedData = sdk.buildTakerBidTypedData as BuildTakerBidTypedData;
const signTakerBid = sdk.signTakerBid as SignTakerBid;

const VERIFYING_CONTRACT = (process.env.VERIFYING_CONTRACT || (addressBook.predictionMarket as any)[CHAIN_ID]?.address) as Address;
const COLLATERAL_TOKEN = (process.env.COLLATERAL_TOKEN || (addressBook.collateralToken as any)[CHAIN_ID]?.address) as Address;

const BID_AMOUNT_DEC = process.env.BID_AMOUNT || '0.01';
const MIN_MAKER_WAGER_DEC = process.env.MIN_MAKER_WAGER || '10';
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS || '60');

const BID_AMOUNT = parseEther(BID_AMOUNT_DEC);
const MIN_MAKER_WAGER = parseEther(MIN_MAKER_WAGER_DEC);

const account = PRIVATE_KEY_HEX
  ? privateKeyToAccount(PRIVATE_KEY_HEX)
  : undefined;
const TAKER = account?.address as Address | undefined;

function formatAddress(addr: Address | string): string {
  try {
    const c = getAddress(addr as Address);
    return `${c.slice(0, 6)}…${c.slice(-4)}`;
  } catch {
    const s = String(addr);
    return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
  }
}

// Simple in-memory cache for condition metadata to avoid repeated API calls
const conditionCache = new Map<string, { shortName?: string | null; question?: string | null }>();

async function getConditionsByIds(ids: string[]): Promise<Map<string, { shortName?: string | null; question?: string | null }>> {
  const uniqueIds = Array.from(new Set(ids)).filter((id) => typeof id === 'string' && id.length > 0);
  const missing = uniqueIds.filter((id) => !conditionCache.has(id));
  if (missing.length > 0) {
    const QUERY = /* GraphQL */ `
      query ConditionsByIds($ids: [String!]!) {
        conditions(where: { id: { in: $ids } }, take: 1000) {
          id
          shortName
          question
        }
      }
    `;
    try {
      const resp = await graphqlRequest<{ conditions: { id: string; shortName?: string | null; question?: string | null }[] }>(
        QUERY,
        { ids: missing }
      );
      for (const row of resp?.conditions ?? []) {
        conditionCache.set(row.id, { shortName: row.shortName ?? null, question: row.question ?? null });
      }
    } catch (e) {
      logger.warn('Condition fetch failed:', e);
    }
  }
  const out = new Map<string, { shortName?: string | null; question?: string | null }>();
  for (const id of uniqueIds) {
    const cached = conditionCache.get(id) || { shortName: null, question: null };
    out.set(id, cached);
  }
  return out;
}

async function approveOnInit() {
  try {
    if (!account) {
      logger.info('Skipping approval: PRIVATE_KEY not set');
      return;
    }
    logger.info([
      '🔐 Ensuring MAX allowance',
      fmt.bullet(fmt.field('token', fmt.value(formatAddress(COLLATERAL_TOKEN)))),
      fmt.bullet(fmt.field('spender', fmt.value(formatAddress(VERIFYING_CONTRACT)))),
      fmt.bullet(fmt.field('chain', fmt.value(`${CHAIN_NAME} (${CHAIN_ID})`))),
    ].join('\n'));
    const chain = chainsById[CHAIN_ID];
    const publicClient = createPublicClient({ transport: http(RPC_URL), chain });
    const walletClient = createWalletClient({ account, transport: http(RPC_URL), chain });

    const current = (await publicClient.readContract({
      address: COLLATERAL_TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [TAKER as Address, VERIFYING_CONTRACT],
    })) as bigint;

    const MAX = (1n << 256n) - 1n;
    if (current >= MAX / 2n) {
      logger.success('Approval already sufficient');
      return;
    }

    const hash = (await walletClient.writeContract({
      address: COLLATERAL_TOKEN,
      abi: erc20Abi,
      functionName: 'approve',
      args: [VERIFYING_CONTRACT, MAX],
      chain,
    })) as Hex;
    await publicClient.waitForTransactionReceipt({ hash });
    logger.success(`Approval tx: ${hash}`);
  } catch (e) {
    logger.error('Approval step failed:', e);
  }
}

function start() {
  void approveOnInit();

  const ws = new WebSocket(RELAYER_WS_URL);

  ws.on('open', () => {
    logger.success('🔌 Connected to relayer');
  });

  ws.on('message', async (data: RawData) => {
    try {
      const msg = JSON.parse(String(data));
      const type = msg?.type as string | undefined;
      if (!type) return;

      if (type === 'auction.started') {
        const auction = msg.payload || {};
        const auctionId = auction.auctionId as string;
        const makerWager = BigInt(auction.wager || '0');
        const makerNonce = (auction.makerNonce as number) ?? 0;
        const auctionChainId = (auction.chainId as number | undefined);

        // Ignore auctions on different chains
        if (auctionChainId && auctionChainId !== CHAIN_ID) {
          return;
        }

        // Ignore auctions below minimum before logging anything
        if (makerWager < MIN_MAKER_WAGER) {
          return;
        }

        // Decode first predictedOutcomes blob to extract conditionIds and yes/no
        try {
          const arr = Array.isArray(auction.predictedOutcomes) ? (auction.predictedOutcomes as string[]) : [];
          if (arr.length > 0) {
            const decodedUnknown = decodeAbiParameters(
              [
                {
                  type: 'tuple[]',
                  components: [
                    { name: 'marketId', type: 'bytes32' },
                    { name: 'prediction', type: 'bool' },
                  ],
                },
              ] as const,
              arr[0] as `0x${string}`
            ) as unknown;
            const decodedArr = Array.isArray(decodedUnknown) ? (decodedUnknown as any)[0] : [];
            const legs = (decodedArr || []) as { marketId: `0x${string}`; prediction: boolean }[];
            const conditionIds = legs.map((l) => l.marketId as string);
            const idToCond = await getConditionsByIds(conditionIds);
            const legLines = legs
              .map((l) => {
                const c = idToCond.get(l.marketId) || {};
                const name = (c.shortName && String(c.shortName).trim()) || (c.question && String(c.question).trim()) || l.marketId;
                const yn = l.prediction ? fmt.yes('Yes') : fmt.no('No');
                return fmt.bullet(`${name}: ${yn}`);
              })
              .join('\n');
            logger.info([`🎯 Auction started ${fmt.id(auctionId)}`, legLines].join('\n'));
          } else {
            logger.info(`🎯 Auction started ${fmt.id(auctionId)}`);
          }
        } catch {
          logger.info(`🎯 Auction started ${fmt.id(auctionId)}`);
        }

        const takerWager = BID_AMOUNT;
        const takerDeadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;

        if (!account || !TAKER) {
          logger.info(
            `Would bid ${BID_AMOUNT_DEC} on auction ${auctionId} but skipping signing/submission: PRIVATE_KEY not set`
          );
          return;
        }

        const { domain, types, primaryType, message } = buildTakerBidTypedData({
          auction: {
            maker: auction.maker as Address,
            resolver: auction.resolver as Address,
            predictedOutcomes: auction.predictedOutcomes as string[],
            wager: auction.wager as string,
          },
          takerWager,
          takerDeadline,
          chainId: CHAIN_ID,
          verifyingContract: VERIFYING_CONTRACT,
          taker: TAKER,
        });

        const takerSignature = await signTakerBid({
          privateKey: PRIVATE_KEY_HEX as Hex,
          domain,
          types,
          primaryType,
          message,
        });

        const bid = {
          type: 'bid.submit',
          payload: {
            auctionId,
            taker: TAKER,
            takerWager: takerWager.toString(),
            takerDeadline,
            takerSignature,
            makerNonce,
          },
        };

        logger.info(`📤 Sending bid ${fmt.value(BID_AMOUNT_DEC)} on ${fmt.id(auctionId)}`);
        ws.send(JSON.stringify(bid), (err?: Error) => {
          if (err) logger.error('⛔️ Bid send failed:', err);
          else logger.success('📨 Bid sent');
        });
      } else if (type === 'bid.ack') {
        const err = msg?.payload?.error as string | undefined;
        if (err) logger.warn('⛔️ Bid rejected:', err);
        else logger.success('✅ Bid acknowledged by relayer');
      } else if (type === 'auction.bids') {
        // Optional visibility
        const count = (msg?.payload?.bids?.length as number | undefined) ?? 0;
        if (count > 0) logger.info(`📈 Bids update for ${fmt.id(String(msg?.payload?.auctionId))}: ${fmt.value(String(count))}`);
      }
    } catch (e) {
      logger.error('💥 Message error:', e);
    }
  });

  ws.on('error', (err: Error) => {
    logger.error('💥 WebSocket error:', err);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    logger.warn('🔌 WebSocket closed:', code, reason.toString());
    setTimeout(start, 3000);
  });
}

start();


