import 'dotenv/config';
import WebSocket from 'ws';
import type { RawData } from 'ws';
import { loadSdk } from './sdk.js';
import { parseEther, decodeAbiParameters, createPublicClient, createWalletClient, erc20Abi, http, getAddress, defineChain, type Address, type Hex, type Chain } from 'viem';
import { graphqlRequest } from '@sapience/sdk/queries';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

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

const RELAYER_WS_URL = process.env.RELAYER_WS_URL || 'wss://relayer.sapience.xyz/auction';

// Ethereal chain definition (trading chain where native token is USDe)
const CHAIN_ID_ETHEREAL = 5064014;
const etherealChain = defineChain({
  id: CHAIN_ID_ETHEREAL,
  name: 'Ethereal',
  nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
  blockExplorers: {
    default: { name: 'Ethereal Explorer', url: 'https://explorer.ethereal.trade' },
  },
});

// Default chain is Ethereal (5064014) for trading
const CHAIN_ID = Number(process.env.CHAIN_ID || String(CHAIN_ID_ETHEREAL));

const chainsById: Record<number, Chain> = {
  [CHAIN_ID_ETHEREAL]: etherealChain,
  [arbitrum.id]: arbitrum,
};
const CHAIN_NAME: string = chainsById[CHAIN_ID]?.name || String(CHAIN_ID);
const DEFAULT_RPC = chainsById[CHAIN_ID]?.rpcUrls?.default?.http?.[0] || chainsById[CHAIN_ID]?.rpcUrls?.public?.http?.[0];
const RPC_URL = getEnv('RPC_URL', DEFAULT_RPC);
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim() || undefined;
const PRIVATE_KEY_HEX = PRIVATE_KEY
  ? ((PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`) as Hex)
  : undefined;

const sdk = await loadSdk();
type ContractsMap = typeof import('@sapience/sdk/contracts').contracts;
type BuildMakerBidTypedData = typeof import('@sapience/sdk/auction/signing').buildMakerBidTypedData;
type SignMakerBid = typeof import('@sapience/sdk/auction/signing').signMakerBid;
type PrepareForTrade = typeof import('@sapience/sdk/onchain/trading').prepareForTrade;

const addressBook = sdk.contracts as ContractsMap;
const buildMakerBidTypedData = sdk.buildMakerBidTypedData as BuildMakerBidTypedData;
const signMakerBid = sdk.signMakerBid as SignMakerBid;
const prepareForTrade = sdk.prepareForTrade as PrepareForTrade | undefined;

const VERIFYING_CONTRACT = (process.env.VERIFYING_CONTRACT || (addressBook.predictionMarket as any)[CHAIN_ID]?.address) as Address;
const COLLATERAL_TOKEN = (process.env.COLLATERAL_TOKEN || (addressBook.collateralToken as any)[CHAIN_ID]?.address) as Address;
const POLYMARKET_RESOLVER = ((addressBook.predictionMarketLZConditionalTokensResolver as any)[CHAIN_ID]?.address as string | undefined)?.toLowerCase();

const BID_AMOUNT_DEC = process.env.BID_AMOUNT || '0.01';
const MIN_MAKER_POSITION_SIZE_DEC = process.env.MIN_MAKER_POSITION_SIZE || '10';
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS || '60');

const BID_AMOUNT = parseEther(BID_AMOUNT_DEC);
const MIN_MAKER_POSITION_SIZE = parseEther(MIN_MAKER_POSITION_SIZE_DEC);

const account = PRIVATE_KEY_HEX
  ? privateKeyToAccount(PRIVATE_KEY_HEX)
  : undefined;
const MAKER = account?.address as Address | undefined;

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
      query ConditionsByIds($where: ConditionWhereInput!) {
        conditions(where: $where, take: 100) {
          id
          shortName
          question
        }
      }
    `;
    try {
      const PAGE_SIZE = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < missing.length; i += PAGE_SIZE) {
        chunks.push(missing.slice(i, i + PAGE_SIZE));
      }
      const allConditions = (await Promise.all(
        chunks.map(async (chunk) => {
          const resp = await graphqlRequest<{ conditions: { id: string; shortName?: string | null; question?: string | null }[] }>(
            QUERY,
            { where: { id: { in: chunk } } }
          );
          return resp?.conditions ?? [];
        })
      )).flat();
      for (const row of allConditions) {
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

/**
 * Prepare collateral for trading.
 * 
 * On Ethereal chain (5064014): Native token is USDe but contracts expect WUSDe.
 * Uses SDK's prepareForTrade to wrap USDe -> WUSDe and approve.
 * 
 * On other chains (Arbitrum, etc.): USDe is already an ERC-20 token, only approval needed.
 */
async function prepareCollateral() {
  try {
    if (!account || !PRIVATE_KEY_HEX) {
      logger.info('Skipping collateral preparation: PRIVATE_KEY not set');
      return;
    }

    logger.info([
      '🔐 Preparing collateral for trading',
      fmt.bullet(fmt.field('chain', fmt.value(`${CHAIN_NAME} (${CHAIN_ID})`))),
      fmt.bullet(fmt.field('collateral', fmt.value(formatAddress(COLLATERAL_TOKEN)))),
      fmt.bullet(fmt.field('spender', fmt.value(formatAddress(VERIFYING_CONTRACT)))),
    ].join('\n'));

    // On Ethereal, use prepareForTrade to handle USDe wrapping + approval
    if (CHAIN_ID === CHAIN_ID_ETHEREAL && prepareForTrade) {
      logger.info('📦 Using prepareForTrade for Ethereal (wrap USDe -> WUSDe + approve)');
      
      const result = await prepareForTrade({
        privateKey: PRIVATE_KEY_HEX,
        collateralAmount: BID_AMOUNT,
        spender: VERIFYING_CONTRACT,
        rpcUrl: RPC_URL,
      });

      if (result.wrapTxHash) {
        logger.success(`Wrapped USDe -> WUSDe: ${result.wrapTxHash}`);
      }
      if (result.approvalTxHash) {
        logger.success(`Approved WUSDe: ${result.approvalTxHash}`);
      }
      logger.success(`Ready for trading. WUSDe balance: ${result.wusdBalance}`);
      return;
    }

    // For other chains (Arbitrum, etc.), use simple MAX approval
    logger.info('📝 Using simple approval for ERC-20 collateral');
    const chain = chainsById[CHAIN_ID];
    const publicClient = createPublicClient({ transport: http(RPC_URL), chain });
    const walletClient = createWalletClient({ account, transport: http(RPC_URL), chain });

    const current = (await publicClient.readContract({
      address: COLLATERAL_TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [MAKER as Address, VERIFYING_CONTRACT],
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
    logger.error('Collateral preparation failed:', e);
  }
}

function start() {
  void prepareCollateral();

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
        const takerPositionSize = BigInt(auction.wager || '0');
        const auctionChainId = (auction.chainId as number | undefined);
        const makerNonce = BigInt(auction.takerNonce as number ?? 0);


        // Ignore auctions on different chains
        if (auctionChainId && auctionChainId !== CHAIN_ID) {
          return;
        }

        // Verify resolver matches Polymarket LZ resolver
        const auctionResolver = String(auction.resolver || '').toLowerCase();
        if (POLYMARKET_RESOLVER && auctionResolver !== POLYMARKET_RESOLVER) {
          logger.warn(`Skipping auction ${auctionId} - unexpected resolver: ${auction.resolver}`);
          return;
        }

        // Ignore auctions below minimum position size before logging anything
        if (takerPositionSize < MIN_MAKER_POSITION_SIZE) {
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

        const makerWager = BID_AMOUNT;
        const makerDeadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;

        if (!account || !MAKER) {
          logger.info(
            `Would bid ${BID_AMOUNT_DEC} on auction ${auctionId} but skipping signing/submission: PRIVATE_KEY not set`
          );
          return;
        }


        const { domain, types, primaryType, message } = buildMakerBidTypedData({
          auction: {
            taker: auction.taker as Address,
            resolver: auction.resolver as Address,
            predictedOutcomes: auction.predictedOutcomes as string[],
            wager: auction.wager as string,
          },
          makerWager,
          makerDeadline,
          chainId: CHAIN_ID,
          verifyingContract: VERIFYING_CONTRACT,
          maker: MAKER,
          makerNonce,
        });

        const makerSignature = await signMakerBid({
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
            maker: MAKER,
            makerWager: makerWager.toString(),
            makerDeadline,
            makerSignature,
            makerNonce: makerNonce.toString(),
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

