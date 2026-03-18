import 'dotenv/config';
import { parseEther, formatEther, createPublicClient, createWalletClient, erc20Abi, http, getAddress, type Address, type Hex, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

// SDK imports — chain config, addresses, queries, signing, WebSocket client
import {
  CHAIN_ID_ETHEREAL,
  etherealChain,
} from '@sapience/sdk/constants';
import {
  collateralToken,
  predictionMarketEscrow,
  getResolverAddress,
} from '@sapience/sdk/contracts/addresses';
import { fetchConditionsByIdsQuery, type ConditionById } from '@sapience/sdk/queries';
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { validateAuctionRFQ, validateBid, isActionable } from '@sapience/sdk/auction/validation';
import { createEscrowAuctionWs, buildBidPayload } from '@sapience/sdk/relayer/escrowAuctionWs';
import { decodePythMarketId, decodePythLazerFeedId } from '@sapience/sdk/auction/encoding';
import { PYTH_FEED_NAMES } from '@sapience/sdk/constants';
import { OutcomeSide, type Pick, type AuctionDetails, type PickJson } from '@sapience/sdk/types';

// Local imports
import { loadSdk } from './sdk.js';
import { PythStrategy } from './strategies/PythStrategy.js';
import { PolymarketStrategy } from './strategies/PolymarketStrategy.js';
import type { Strategy } from './strategies/types.js';

// ============================================================================
// Logging
// ============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

const color = (text: string, ...codes: string[]) => `${codes.join('')}${text}${ANSI.reset}`;

const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(color(msg, ANSI.bold, ANSI.cyan), ...args),
  success: (msg: string, ...args: unknown[]) => console.log(color(msg, ANSI.bold, ANSI.green), ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(color(msg, ANSI.bold, ANSI.yellow), ...args),
  error: (msg: string, ...args: unknown[]) => console.error(color(msg, ANSI.bold, ANSI.red), ...args),
};

const fmt = {
  value: (s: string) => color(s, ANSI.bold, ANSI.magenta),
  id: (s: string) => color(s, ANSI.bold, ANSI.cyan),
  yes: (s = 'Yes') => color(s, ANSI.bold, ANSI.green),
  no: (s = 'No') => color(s, ANSI.bold, ANSI.red),
  field: (name: string, val: string) => `${color(`${name}:`, ANSI.gray)} ${val}`,
  bullet: (s: string) => `  - ${s}`,
};

function formatAddress(addr: Address | string): string {
  try {
    const c = getAddress(addr as Address);
    return `${c.slice(0, 6)}…${c.slice(-4)}`;
  } catch {
    const s = String(addr);
    return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
  }
}

// ============================================================================
// Configuration
// ============================================================================

const RELAYER_WS_URL = process.env.RELAYER_WS_URL || 'wss://relayer.sapience.xyz/auction';
const CHAIN_ID = Number(process.env.CHAIN_ID || String(CHAIN_ID_ETHEREAL));

const chainsById: Record<number, Chain> = {
  [CHAIN_ID_ETHEREAL]: etherealChain,
  [arbitrum.id]: arbitrum,
};
const CHAIN_NAME: string = chainsById[CHAIN_ID]?.name || String(CHAIN_ID);
const RPC_URL = process.env.RPC_URL || chainsById[CHAIN_ID]?.rpcUrls?.default?.http?.[0] || 'https://rpc.ethereal.trade';
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim() || undefined;
const PRIVATE_KEY_HEX = PRIVATE_KEY
  ? ((PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`) as Hex)
  : undefined;

// Contract addresses from SDK
const VERIFYING_CONTRACT = (process.env.VERIFYING_CONTRACT || predictionMarketEscrow[CHAIN_ID]?.address) as Address | undefined;
const COLLATERAL_TOKEN = (process.env.COLLATERAL_TOKEN || collateralToken[CHAIN_ID]?.address) as Address;

// Sponsor allowlist
const SPONSOR_ALLOWLIST: Set<string> | null = (() => {
  const raw = (process.env.SPONSOR_ALLOWLIST || '').trim();
  if (!raw) return null;
  const addresses = raw.split(',').map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0);
  return addresses.length > 0 ? new Set(addresses) : null;
})();

// Require predictor intent signature (default: true — skip unsigned auctions)
const REQUIRE_INTENT_SIGNATURE = (process.env.REQUIRE_INTENT_SIGNATURE || 'true').toLowerCase() !== 'false';

// Bidding parameters
const MIN_MAKER_WAGER_DEC = process.env.MIN_MAKER_POSITION_SIZE || '1';
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS || '60');

// Strategy pricing parameters
const EDGE_BPS = Number(process.env.EDGE_BPS || '200');
const MAX_BID_DEC = process.env.MAX_BID_AMOUNT || '100';
const MAX_BID = parseEther(MAX_BID_DEC);
const VOLATILITY = Number(process.env.VOLATILITY || '0.80');
const MIN_CP_WIN_PROB = Number(process.env.MIN_CP_WIN_PROB || '0.05');


const MIN_MAKER_WAGER = parseEther(MIN_MAKER_WAGER_DEC);

const account = PRIVATE_KEY_HEX ? privateKeyToAccount(PRIVATE_KEY_HEX) : undefined;
const MAKER = account?.address as Address | undefined;


/** Human-readable label for a conditionId (decodes Pyth market params if applicable) */
function formatConditionId(conditionId: string): string {
  const market = decodePythMarketId(conditionId as Hex);
  if (market) {
    const feedId = decodePythLazerFeedId(market.priceId);
    const feedName = feedId !== null ? (PYTH_FEED_NAMES[feedId] ?? `feed#${feedId}`) : market.priceId.slice(0, 10);
    const strike = Number(market.strikePrice) * Math.pow(10, market.strikeExpo);
    const expiry = new Date(Number(market.endTime) * 1000).toISOString().slice(0, 16);
    return `${feedName} ${market.overWinsOnTie ? '≥' : '>'} ${strike} by ${expiry}`;
  }
  return conditionId.slice(0, 10);
}

// ============================================================================
// Pricing strategies — resolver address → strategy
// ============================================================================

const pythResolverAddr = (
  process.env.PYTH_RESOLVER_ADDRESS || getResolverAddress('pyth', CHAIN_ID) || ''
).toLowerCase();
const ctResolverAddrs = [
  process.env.CT_RESOLVER_ADDRESS,
  getResolverAddress('conditionalTokens', CHAIN_ID),
].filter((a): a is string => !!a).map((a) => a.toLowerCase());

const strategies: Strategy[] = [
  ...(pythResolverAddr ? [new PythStrategy({
    resolverAddresses: [pythResolverAddr],
    volatility: VOLATILITY,
    feedMapOverride: process.env.PYTH_FEED_MAP,
  })] : []),
  ...(ctResolverAddrs.length > 0 ? [new PolymarketStrategy({
    resolverAddresses: ctResolverAddrs,
  })] : []),
];

// ============================================================================
// Condition metadata cache (wraps SDK query with local caching)
// ============================================================================

const conditionCache = new Map<string, ConditionById>();

async function getConditionsByIds(ids: string[]): Promise<Map<string, ConditionById>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const missing = uniqueIds.filter((id) => !conditionCache.has(id));

  if (missing.length > 0) {
    try {
      const conditions = await fetchConditionsByIdsQuery(missing);
      for (const c of conditions) {
        conditionCache.set(c.id, c);
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const msg = e instanceof Error ? e.message : String(e);
      const brief = status ? `HTTP ${status}` : msg.slice(0, 120);
      const ids = missing.map((id) => id.slice(0, 10)).join(', ');
      logger.warn(`Condition fetch failed for [${ids}]: ${brief} — continuing with cached data`);
    }
  }

  const out = new Map<string, ConditionById>();
  for (const id of uniqueIds) {
    const cached = conditionCache.get(id);
    if (cached) out.set(id, cached);
  }
  return out;
}

// ============================================================================
// Per-bid collateral preparation (wrap + approve on demand via SDK)
// ============================================================================

// Load prepareForTrade from SDK (Ethereal: wrap USDe -> WUSDe + approve)
const sdk = await loadSdk();
type PrepareForTrade = (args: {
  privateKey: Hex;
  collateralAmount: bigint;
  spender?: Hex;
  rpcUrl?: string;
  chainId?: number;
}) => Promise<{ ready: boolean; wrapTxHash?: Hex; approvalTxHash?: Hex; wusdBalance: bigint }>;
const prepareForTrade = sdk.prepareForTrade as PrepareForTrade | undefined;

/**
 * Ensure sufficient wrapped collateral + approval for a specific bid amount.
 * Called per-bid in handleAuction — only wraps/approves when needed.
 */
async function ensureCollateral(bidAmount: bigint): Promise<boolean> {
  if (!account || !PRIVATE_KEY_HEX || !VERIFYING_CONTRACT) return false;

  try {
    if (CHAIN_ID === CHAIN_ID_ETHEREAL && prepareForTrade) {
      const result = await prepareForTrade({
        privateKey: PRIVATE_KEY_HEX,
        collateralAmount: bidAmount,
        spender: VERIFYING_CONTRACT,
        rpcUrl: RPC_URL,
      });
      if (result.wrapTxHash) logger.info(`🔄 Wrapped USDe -> WUSDe: ${result.wrapTxHash}`);
      if (result.approvalTxHash) logger.info(`✅ Approved WUSDe: ${result.approvalTxHash}`);
      return true;
    }

    // Non-Ethereal: simple ERC-20 approval check
    const chain = chainsById[CHAIN_ID];
    const publicClient = createPublicClient({ transport: http(RPC_URL), chain });

    const current = (await publicClient.readContract({
      address: COLLATERAL_TOKEN,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [MAKER as Address, VERIFYING_CONTRACT],
    })) as bigint;

    if (current >= bidAmount) return true;

    const walletClient = createWalletClient({ account, transport: http(RPC_URL), chain });
    const MAX = (1n << 256n) - 1n;
    const hash = (await walletClient.writeContract({
      address: COLLATERAL_TOKEN,
      abi: erc20Abi,
      functionName: 'approve',
      args: [VERIFYING_CONTRACT, MAX],
      chain,
    })) as Hex;
    await publicClient.waitForTransactionReceipt({ hash });
    logger.info(`✅ Approved collateral: ${hash}`);
    return true;
  } catch (e) {
    logger.error('Collateral preparation failed:', e);
    return false;
  }
}

// ============================================================================
// Dynamic quoting — routes each pick to its matching strategy
// ============================================================================

async function computeQuote(
  auction: AuctionDetails,
): Promise<{ bidAmount: bigint; fairBid: bigint; counterpartyWinProb: number; legProbs: Map<string, number | null> } | null> {
  const picks = (auction.picks || []) as PickJson[];
  if (picks.length === 0) return null;

  const conditionIds = picks.map((p) => p.conditionId);
  const metas = await getConditionsByIds(conditionIds);

  let predictorWinProb = 1;
  let pricedLegs = 0;
  const legProbs = new Map<string, number | null>();

  for (const pick of picks) {
    const strategy = strategies.find((s) => s.matchesResolver(pick.conditionResolver));
    const meta = metas.get(pick.conditionId);

    let yesProbability: number | null = null;
    if (!strategy) {
      logger.warn(`  leg ${formatConditionId(pick.conditionId)}: no strategy for resolver ${formatAddress(pick.conditionResolver)}`);
    } else {
      yesProbability = await strategy.getYesProbability(pick.conditionId, meta ?? null);
      if (yesProbability === null) {
        const urls = meta?.similarMarkets ?? [];
        const slug = urls.find(u => u.includes('polymarket.com'))?.split('#')[1];
        logger.warn(`  leg ${formatConditionId(pick.conditionId)}: ${strategy.name} returned null${slug ? ` (slug: ${slug})` : urls.length > 0 ? ` (similarMarkets: ${urls.join(', ')})` : ''}`);
      }
    }

    if (yesProbability === null) {
      legProbs.set(pick.conditionId, null);
      continue;
    }

    pricedLegs++;
    const pickSuccessProb =
      pick.predictedOutcome === OutcomeSide.YES
        ? yesProbability
        : 1 - yesProbability;

    legProbs.set(pick.conditionId, pickSuccessProb);
    predictorWinProb *= pickSuccessProb;
  }

  // Need at least one priced leg to have any edge
  if (pricedLegs === 0) return null;

  const counterpartyWinProb = 1 - predictorWinProb;
  if (counterpartyWinProb < MIN_CP_WIN_PROB) return null;

  const predictorCollateral = BigInt(auction.predictorCollateral || '0');
  if (predictorCollateral === 0n) return null;

  // Fair bid: predictorCollateral × P(cp wins) / P(predictor wins)
  // With edge: bid = fair × (1 − edge)
  const fairBidFloat =
    (Number(predictorCollateral) * counterpartyWinProb) / predictorWinProb;
  const bidFloat = fairBidFloat * (1 - EDGE_BPS / 10_000);

  const fairBid = BigInt(Math.floor(Math.max(0, bidFloat)));
  let bidAmount = fairBid;
  if (bidAmount > MAX_BID) bidAmount = MAX_BID;
  if (bidAmount <= 0n) return null;

  return { bidAmount, fairBid, counterpartyWinProb, legProbs };
}

// ============================================================================
// Auction handler — called for each new auction
// ============================================================================

function convertPicksFromJson(picks: PickJson[]): Pick[] {
  return picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome as OutcomeSide,
  }));
}

async function handleAuction(auction: AuctionDetails, submitBid: (payload: ReturnType<typeof buildBidPayload>) => boolean) {
  const auctionId = auction.auctionId;
  const predictorCollateral = BigInt(auction.predictorCollateral || '0');
  const picks = (auction.picks || []) as PickJson[];

  const resolvers = [...new Set(picks.map((p) => formatAddress(p.conditionResolver)))].join(', ');

  logger.info(`${color('⚡', ANSI.dim)} ${fmt.id(auctionId.slice(0, 8))} ${color(`${picks.length} leg(s), resolvers: ${resolvers}, collateral: ${formatEther(predictorCollateral)}`, ANSI.dim)}`);

  // Unified auction validation: fields + chain + deadline + intent signature
  if (VERIFYING_CONTRACT) {
    const rfqResult = await validateAuctionRFQ(auction, {
      verifyingContract: VERIFYING_CONTRACT,
      chainId: CHAIN_ID,
      requireSignature: REQUIRE_INTENT_SIGNATURE,
    });

    if (!isActionable(rfqResult)) {
      logger.warn(`Skipping auction ${auctionId}: ${rfqResult.reason}`);
      return;
    }
  }

  // Ignore auctions below minimum wager (business logic, not validation)
  if (predictorCollateral < MIN_MAKER_WAGER) {
    logger.warn(`Skipping auction ${auctionId}: collateral ${formatEther(predictorCollateral)} below min ${MIN_MAKER_WAGER_DEC}`);
    return;
  }

  // ---- Dynamic quoting via strategies ----
  const quote = await computeQuote(auction);
  if (!quote) {
    logger.warn(`Skipping auction ${auctionId}: no strategy could price any leg`);
    return;
  }

  // Build leg lines with per-leg probabilities
  const idToCond = await getConditionsByIds(picks.map((p) => p.conditionId));
  const legLines = picks
    .map((p) => {
      const c = idToCond.get(p.conditionId);
      const name = (c?.shortName && String(c.shortName).trim()) || (c?.question && String(c.question).trim()) || formatConditionId(p.conditionId);
      const yn = p.predictedOutcome === OutcomeSide.YES ? fmt.yes('Yes') : fmt.no('No');
      const prob = quote.legProbs.get(p.conditionId);
      const probLabel = prob !== null && prob !== undefined
        ? color(` ${(prob * 100).toFixed(0)}%`, ANSI.dim)
        : color(' unpriced', ANSI.dim);
      return fmt.bullet(`${name}: ${yn}${probLabel}`);
    })
    .join('\n');

  const counterpartyCollateral = quote.bidAmount;
  const bidDec = formatEther(counterpartyCollateral);
  const totalPayout = counterpartyCollateral + predictorCollateral;
  const winDec = formatEther(totalPayout);
  const theyLose = (quote.counterpartyWinProb * 100).toFixed(1);
  const fairDec = formatEther(quote.fairBid);
  const capped = quote.bidAmount < quote.fairBid
    ? `\n  ${color(`↳ fair bid: ${fairDec} USDe, capped at ${MAX_BID_DEC}`, ANSI.dim)}`
    : '';

  if (!account || !MAKER) {
    logger.info([
      `📋 Bid ${fmt.value(`${bidDec} USDe`)} to win ${fmt.value(`${winDec} USDe`)} (implies ${fmt.yes(`${theyLose}%`)} chance they lose), against:`,
      legLines,
      fmt.bullet(color('dry run — no PRIVATE_KEY', ANSI.dim)),
    ].join('\n') + capped);
    return;
  }

  // Ensure sufficient wrapped collateral + approval for this bid
  const collateralReady = await ensureCollateral(counterpartyCollateral);
  if (!collateralReady) {
    logger.error(`⛔️ Skipping auction ${auctionId}: insufficient collateral for ${bidDec} USDe bid`);
    return;
  }

  const counterpartyDeadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  // Bitmap nonces — any unused random value is valid (Permit2-style)
  const counterpartyNonce = BigInt(crypto.getRandomValues(new Uint32Array(1))[0]) + 1n;

  // Validate sponsor
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
  const requestedSponsor = (auction.predictorSponsor ?? ZERO_ADDR).toLowerCase();
  const effectiveSponsor: Address = (
    requestedSponsor === ZERO_ADDR ||
    !SPONSOR_ALLOWLIST ||
    SPONSOR_ALLOWLIST.has(requestedSponsor)
  )
    ? requestedSponsor as Address
    : ZERO_ADDR as Address;

  if (requestedSponsor !== ZERO_ADDR && effectiveSponsor === ZERO_ADDR) {
    logger.warn(`⚠️  Sponsor ${formatAddress(requestedSponsor)} not in allowlist — signing as self-funded`);
  }

  // Sign counterparty mint approval
  const typedData = buildCounterpartyMintTypedData({
    picks: convertPicksFromJson(auction.picks),
    predictorCollateral,
    counterpartyCollateral,
    predictor: auction.predictor as Address,
    counterparty: MAKER,
    counterpartyNonce,
    counterpartyDeadline,
    predictorSponsor: effectiveSponsor,
    predictorSponsorData: effectiveSponsor !== ZERO_ADDR
      ? (auction.predictorSponsorData ?? '0x') as `0x${string}`
      : '0x' as `0x${string}`,
    verifyingContract: VERIFYING_CONTRACT!,
    chainId: CHAIN_ID,
  });

  const counterpartySignature = await account.signTypedData({
    domain: { ...typedData.domain, chainId: Number(typedData.domain.chainId) },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  const payload = buildBidPayload({
    auctionId,
    counterparty: MAKER,
    counterpartyCollateral: counterpartyCollateral.toString(),
    counterpartyNonce: Number(counterpartyNonce),
    counterpartyDeadline: Number(counterpartyDeadline),
    counterpartySignature,
  });

  // Self-validate bid before submitting to catch signing/parameter errors locally
  const bidValidation = await validateBid(payload, auction, {
    verifyingContract: VERIFYING_CONTRACT!,
    chainId: CHAIN_ID,
  });
  if (!isActionable(bidValidation)) {
    logger.error(`⛔️ Bid self-validation failed: ${bidValidation.reason}`);
    return;
  }

  logger.info([
    `📤 Bid ${fmt.value(`${bidDec} USDe`)} to win ${fmt.value(`${winDec} USDe`)} (implies ${fmt.yes(`${theyLose}%`)} chance they lose), against:`,
    legLines,
  ].join('\n'));
  const sent = submitBid(payload);
  if (!sent) logger.error('⛔️ Bid send failed: not connected');
  else logger.success('📨 Bid sent');
}

// ============================================================================
// Main — connect via SDK WebSocket client
// ============================================================================

async function start() {
  if (!VERIFYING_CONTRACT) {
    logger.error('Cannot start: PredictionMarketEscrow contract address not available');
    return;
  }

  const client = await createEscrowAuctionWs(RELAYER_WS_URL, {
    onOpen: () => {
      logger.success('🔌 Connected to relayer');
      logger.info([
        '📊 Market maker configuration:',
        fmt.bullet(fmt.field('Chain', fmt.value(`${CHAIN_NAME} (${CHAIN_ID})`))),
        fmt.bullet(fmt.field('Max bid', fmt.value(`${MAX_BID_DEC}`))),
        fmt.bullet(fmt.field('Edge', fmt.value(`${EDGE_BPS} bps`))),
        fmt.bullet(fmt.field('Volatility', fmt.value(`${(VOLATILITY * 100).toFixed(0)}%`))),
        fmt.bullet(fmt.field('Min maker wager', fmt.value(`${MIN_MAKER_WAGER_DEC}`))),
        fmt.bullet(fmt.field('Strategies', fmt.value(strategies.map(s => s.name).join(', ') || 'none'))),
        fmt.bullet(fmt.field('Contract', fmt.value(formatAddress(VERIFYING_CONTRACT!)))),
        fmt.bullet(fmt.field('Verify intent sig', REQUIRE_INTENT_SIGNATURE ? fmt.yes('yes') : fmt.no('no'))),
        MAKER ? fmt.bullet(fmt.field('Maker', fmt.value(formatAddress(MAKER)))) : fmt.bullet(fmt.field('Maker', fmt.no('not configured (dry run)'))),
      ].join('\n'));
    },

    onAuctionStarted: (auction) => {
      void handleAuction(auction, (payload) => client.submitBid(payload)).catch((e) => {
        logger.error('💥 Auction handler error:', e);
      });
    },

    onBidAck: (payload) => {
      if (payload.error) logger.warn('⛔️ Bid rejected:', payload.error);
      else logger.success('✅ Bid acknowledged by relayer');
    },

    onAuctionBids: (payload) => {
      if (payload.bids.length > 0) {
        logger.info(`📈 Bids update for ${fmt.id(payload.auctionId)}: ${fmt.value(String(payload.bids.length))}`);
      }
    },

    onAuctionFilled: (payload) => {
      logger.success(`🎉 Auction filled ${fmt.id(payload.auctionId)} - tx: ${fmt.value(payload.transactionHash)}`);
    },

    onAuctionExpired: (payload) => {
      logger.warn(`⏰ Auction expired ${fmt.id(payload.auctionId)}: ${payload.reason || 'unknown'}`);
    },

    onError: (err) => {
      logger.error('💥 WebSocket error:', err);
    },

    onClose: (_code, _reason) => {
      logger.warn('🔌 WebSocket closed — reconnecting...');
    },
  });

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    client.close();
    process.exit(0);
  });
}

start();
