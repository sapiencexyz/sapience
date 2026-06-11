// All /api routes as a framework-free (req, res) handler. Stateless: every
// durable fact lives on-chain (receipt NFT = submissions + payout flags,
// escrow events = funded lines) or in deployment config (pools, master
// secret). The same handler runs under node:http (server.ts) and as a
// Vercel function (api/index.ts).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isAddress, type Address, type Hex } from 'viem';
import { isValidAdminSession, issueNonce, siweLogin } from './adminAuth.js';
import { env } from './config.js';
import {
  cardSeed,
  cardTag,
  drawCells,
  fairnessCommitment,
  poolSecret,
} from './draw.js';
import { allEntitlements } from './entitlements.js';
import {
  fundedLineFlags,
  fundedPredictions,
  lineIsFunded,
  linePicks,
} from './chain.js';
import { buildLines, LINES_PER_CARD } from './lines.js';
import { loadPools, parsePools, poolIsOpen } from './pool.js';
import { cardCount, chainSubmission, mintReceipt } from './receipt.js';
import { restoreSessionClient } from './session.js';
import { prepareCollateral, submitLine } from './submitLine.js';
import type { PoolConfig, SerializedSession } from './types.js';
import bundledPools from '../pool.json' with { type: 'json' };

// Pools are deployment config, loaded once per process. Last entry = active.
// The committed pool.json is bundled into the build (works on serverless,
// no filesystem needed); POOL_PATH overrides it with a file on disk.
const pools = env.POOL_PATH
  ? loadPools(env.POOL_PATH)
  : parsePools(bundledPools);
const poolById = new Map(pools.map((p) => [p.poolId, p]));
export const activePool = (): PoolConfig => pools[pools.length - 1];

const secretFor = (poolId: string): Hex =>
  poolSecret(env.SERVER_SECRET as Hex, poolId);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk;
      if (data.length > limit) {
        reject(new HttpError(413, 'Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function isAdmin(req: IncomingMessage): boolean {
  const auth = req.headers.authorization ?? '';
  // SIWE-issued, HMAC-signed session token (the admin UI path).
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && isValidAdminSession(bearer)) return true;
  // Static token fallback (scripts/curl).
  const got = Buffer.from(auth);
  const want = Buffer.from(`Bearer ${env.ADMIN_TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Resolves the pool a request targets: explicit poolId or the active one. */
function resolvePool(poolId: string | null): PoolConfig {
  if (!poolId) return activePool();
  const pool = poolById.get(poolId);
  if (!pool) throw new HttpError(404, `Unknown pool ${poolId}`);
  return pool;
}

/** Validates + restores the session the client sent with this request. */
async function sessionFor(
  player: Address,
  session: SerializedSession | undefined,
) {
  if (!session) {
    throw new HttpError(401, 'session required (serialized session key)');
  }
  if (
    session.config?.smartAccountAddress?.toLowerCase() !==
    player.toLowerCase()
  ) {
    throw new HttpError(400, 'session does not belong to player');
  }
  try {
    return await restoreSessionClient(session);
  } catch (e) {
    throw new HttpError(
      401,
      e instanceof Error ? e.message : 'Invalid session',
    );
  }
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const route = `${req.method} ${url.pathname}`;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    });
    res.end();
    return true;
  }

  if (route === 'GET /api/health') {
    json(res, 200, { ok: true });
    return true;
  }

  if (route === 'GET /api/pool') {
    const pool = resolvePool(url.searchParams.get('poolId'));
    json(res, 200, {
      poolId: pool.poolId,
      /** 1-based position in the pool list — display ordinal. */
      poolNumber: pools.indexOf(pool) + 1,
      cutoff: pool.cutoff,
      open: poolIsOpen(pool),
      conditions: pool.conditions,
      multiplierBps: pool.multiplierBps,
      referralBps: pool.referralBps,
      minCardPriceWei: pool.minCardPriceWei,
      fairnessCommitment: fairnessCommitment(secretFor(pool.poolId)),
      receiptContract: env.RECEIPT_CONTRACT_ADDRESS,
    });
    return true;
  }

  if (route === 'GET /api/fairness') {
    json(res, 200, {
      scheme:
        'poolSecret = keccak256(master ‖ utf8(poolId)); ' +
        'seed = keccak256(poolSecret ‖ utf8(poolId) ‖ player ‖ ' +
        'uint32(cardIndex)); ' +
        'layout = partial Fisher-Yates over pool conditions, ' +
        'rehashing keccak256(seed ‖ pad32(i)) per step',
      pools: pools.map((pool) => ({
        poolId: pool.poolId,
        cutoff: pool.cutoff,
        commitment: fairnessCommitment(secretFor(pool.poolId)),
        // The secret is only revealed once the pool can no longer be played.
        ...(poolIsOpen(pool) ? {} : { secret: secretFor(pool.poolId) }),
      })),
    });
    return true;
  }

  if (route === 'GET /api/card') {
    const player = url.searchParams.get('player');
    if (!player || !isAddress(player)) {
      json(res, 400, { error: 'player query param required' });
      return true;
    }
    const pool = resolvePool(url.searchParams.get('poolId'));
    const rawIndex = url.searchParams.get('cardIndex');
    const cardIndex = rawIndex == null ? 0 : Number(rawIndex);
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      json(res, 400, { error: 'cardIndex must be a non-negative integer' });
      return true;
    }
    const count = await cardCount(pool.poolId, player);
    // Indexes are sequential: existing cards plus a preview of the next one.
    if (cardIndex > count) {
      json(res, 404, {
        error: `cardIndex ${cardIndex} not dealt yet (next is ${count})`,
      });
      return true;
    }
    const submission =
      cardIndex < count
        ? await chainSubmission(pool.poolId, player, cardIndex)
        : null;
    // Submitted cards use the chain-stamped seed; the next card derives.
    const seed =
      submission?.seed ??
      cardSeed(secretFor(pool.poolId), pool.poolId, player, cardIndex);
    const cells = drawCells(pool.conditions, seed);
    const funded = submission
      ? await fundedLineFlags(
          player,
          cells,
          submission.yesMask,
          cardTag(pool.poolId, player, cardIndex),
          BigInt(submission.cardPriceWei) / BigInt(LINES_PER_CARD),
        )
      : undefined;
    const lines = buildLines().map((l, i) => ({
      lineId: l.id,
      cellIndices: l.cellIndices,
      funded: funded?.[i] ?? false,
    }));
    json(res, 200, {
      poolId: pool.poolId,
      cutoff: pool.cutoff,
      open: poolIsOpen(pool),
      player,
      cardIndex,
      cardCount: count,
      cells,
      yesMask: submission?.yesMask ?? null,
      cardPriceWei: submission?.cardPriceWei ?? null,
      submittedAt: submission ? submission.submittedAt * 1000 : null,
      receiptTokenId: submission?.tokenId.toString() ?? null,
      lines,
    });
    return true;
  }

  // Summary of all the player's cards in a pool — drives the card selector
  // and the "new card" button.
  if (route === 'GET /api/cards') {
    const player = url.searchParams.get('player');
    if (!player || !isAddress(player)) {
      json(res, 400, { error: 'player query param required' });
      return true;
    }
    const pool = resolvePool(url.searchParams.get('poolId'));
    const count = await cardCount(pool.poolId, player);
    const funded = count > 0 ? await fundedPredictions(player) : [];
    const cards = await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        const sub = await chainSubmission(pool.poolId, player, i);
        if (!sub) return null;
        const cells = drawCells(pool.conditions, sub.seed);
        const tag = cardTag(pool.poolId, player, i);
        const stake = BigInt(sub.cardPriceWei) / BigInt(LINES_PER_CARD);
        const linesFunded = buildLines().filter((l) =>
          lineIsFunded(funded, linePicks(l, cells, sub.yesMask), tag, stake),
        ).length;
        return {
          cardIndex: i,
          receiptTokenId: sub.tokenId.toString(),
          yesMask: sub.yesMask,
          cardPriceWei: sub.cardPriceWei,
          submittedAt: sub.submittedAt * 1000,
          linesFunded,
        };
      }),
    );
    json(res, 200, {
      poolId: pool.poolId,
      open: poolIsOpen(pool),
      cardCount: count,
      cards: cards.filter(Boolean),
    });
    return true;
  }

  // Records the submission by minting the receipt NFT — the on-chain lock
  // of (sides, price, referrer). Lines are funded afterwards, one
  // POST /api/card/line each, driven by the client.
  if (route === 'POST /api/card/submit') {
    const body = await readJson<{
      player?: string;
      cardIndex?: number;
      yesMask?: number;
      cardPriceWei?: string;
      ref?: string;
      session?: SerializedSession;
    }>(req);
    const { player, cardIndex, yesMask, cardPriceWei, ref } = body;
    const pool = activePool();
    if (!player || !isAddress(player)) {
      json(res, 400, { error: 'player required' });
      return true;
    }
    // Explicit so a stale tab can't stamp its sides onto a different
    // layout than the one it displayed.
    if (
      typeof cardIndex !== 'number' ||
      !Number.isInteger(cardIndex) ||
      cardIndex < 0
    ) {
      json(res, 400, { error: 'cardIndex required (0-based integer)' });
      return true;
    }
    if (
      typeof yesMask !== 'number' ||
      !Number.isInteger(yesMask) ||
      yesMask < 0 ||
      yesMask > 0xffff
    ) {
      json(res, 400, { error: 'yesMask must be 0..65535' });
      return true;
    }
    let price: bigint;
    try {
      price = BigInt(cardPriceWei ?? '');
    } catch {
      json(res, 400, { error: 'cardPriceWei required (wei string)' });
      return true;
    }
    if (price < BigInt(pool.minCardPriceWei)) {
      json(res, 400, { error: 'cardPriceWei below pool minimum' });
      return true;
    }
    if (price % BigInt(LINES_PER_CARD) !== 0n) {
      json(res, 400, { error: 'cardPriceWei must be divisible by 10' });
      return true;
    }
    if (ref !== undefined && ref !== null && !isAddress(ref)) {
      json(res, 400, { error: 'ref must be an address' });
      return true;
    }
    if (!poolIsOpen(pool)) {
      json(res, 409, { error: 'Pool is closed (cutoff passed)' });
      return true;
    }
    // The session isn't needed to mint the receipt (the minter does that),
    // but requiring a valid one here means a card can't be locked in for a
    // player the backend could never fund lines for.
    const sessionClient = await sessionFor(player, body.session);

    // Indexes are strictly sequential: a retry of an existing index is
    // idempotent, the next index is a new card, anything beyond is stale.
    const count = await cardCount(pool.poolId, player);
    if (cardIndex > count) {
      json(res, 409, {
        error: `cardIndex ${cardIndex} is not next (expected ${count})`,
      });
      return true;
    }

    const seed = cardSeed(secretFor(pool.poolId), pool.poolId, player, cardIndex);
    const submission = await mintReceipt({
      player,
      poolId: pool.poolId,
      cardIndex,
      seed,
      yesMask,
      cardPriceWei: price.toString(),
      ref: (ref as Address | undefined) ?? null,
    });
    // Idempotent retry: the chain locked sides/price at first submit.
    if (
      submission.yesMask !== yesMask ||
      submission.cardPriceWei !== price.toString()
    ) {
      json(res, 409, {
        error: 'Card already submitted with different sides/price',
      });
      return true;
    }
    // Wrap + approve for the WHOLE card now, in one UserOp, so the 10
    // concurrent line requests that follow don't each race their own prep.
    await prepareCollateral(sessionClient, player, price);
    json(res, 200, {
      poolId: pool.poolId,
      cardIndex,
      receiptTokenId: submission.tokenId.toString(),
    });
    return true;
  }

  // Funds one line, synchronously. The client calls this once per line
  // (and again on retry); sides/price/seed come from the receipt NFT.
  if (route === 'POST /api/card/line') {
    const body = await readJson<{
      player?: string;
      poolId?: string;
      cardIndex?: number;
      lineIndex?: number;
      session?: SerializedSession;
    }>(req);
    const { player, cardIndex, lineIndex } = body;
    if (!player || !isAddress(player)) {
      json(res, 400, { error: 'player required' });
      return true;
    }
    if (
      typeof cardIndex !== 'number' ||
      !Number.isInteger(cardIndex) ||
      cardIndex < 0
    ) {
      json(res, 400, { error: 'cardIndex required (0-based integer)' });
      return true;
    }
    if (
      typeof lineIndex !== 'number' ||
      !Number.isInteger(lineIndex) ||
      lineIndex < 0 ||
      lineIndex >= LINES_PER_CARD
    ) {
      json(res, 400, { error: `lineIndex must be 0..${LINES_PER_CARD - 1}` });
      return true;
    }
    const pool = resolvePool(body.poolId ?? null);
    if (!poolIsOpen(pool)) {
      json(res, 409, { error: 'Pool is closed (cutoff passed)' });
      return true;
    }
    const submission = await chainSubmission(pool.poolId, player, cardIndex);
    if (!submission) {
      json(res, 409, { error: 'No submission — POST /api/card/submit first' });
      return true;
    }
    // The receipt stamps the card's seed — chain record, not a re-derive.
    const cells = drawCells(pool.conditions, submission.seed);
    const stakePerLineWei =
      BigInt(submission.cardPriceWei) / BigInt(LINES_PER_CARD);
    // Monotonic funded check (escrow events): never double-mint a line,
    // even after the player redeemed (burned) the position.
    const funded = await fundedLineFlags(
      player,
      cells,
      submission.yesMask,
      cardTag(pool.poolId, player, cardIndex),
      stakePerLineWei,
    );
    if (funded[lineIndex]) {
      json(res, 200, { lineIndex, funded: true, alreadyFunded: true });
      return true;
    }
    const sessionClient = await sessionFor(player, body.session);
    try {
      const result = await submitLine({
        sessionClient,
        smartAccountAddress: player,
        cells,
        yesMask: submission.yesMask,
        stakePerLineWei,
        lineIndex,
        cardIndex,
        poolId: pool.poolId,
      });
      json(res, 200, {
        lineIndex,
        funded: true,
        lineId: result.lineId,
        txHash: result.txHash,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[bingo-server] line ${lineIndex} failed for ${player}:`, msg);
      json(res, 502, { error: msg, lineIndex, funded: false });
    }
    return true;
  }

  if (route === 'GET /api/admin/nonce') {
    json(res, 200, { nonce: issueNonce() });
    return true;
  }

  if (route === 'POST /api/admin/login') {
    const body = await readJson<{ message?: string; signature?: string }>(req);
    if (!body.message || !body.signature?.startsWith('0x')) {
      json(res, 400, { error: 'message and signature required' });
      return true;
    }
    try {
      const session = await siweLogin(body.message, body.signature as Hex);
      json(res, 200, session);
    } catch (e) {
      json(res, 401, {
        error: e instanceof Error ? e.message : 'Login failed',
      });
    }
    return true;
  }

  if (route === 'GET /api/admin/entitlements') {
    if (!isAdmin(req)) {
      json(res, 401, { error: 'Unauthorized' });
      return true;
    }
    const rows = await allEntitlements(pools);
    const totalBonus = rows.reduce(
      (s, r) => s + BigInt(r.bonusOwedWei ?? '0'),
      0n,
    );
    const totalReferral = rows.reduce(
      (s, r) => s + BigInt(r.referralOwedWei ?? '0'),
      0n,
    );
    json(res, 200, {
      poolId: activePool().poolId,
      rows,
      totalBonusOwedWei: totalBonus.toString(),
      totalReferralOwedWei: totalReferral.toString(),
    });
    return true;
  }

  if (url.pathname.startsWith('/api/')) {
    json(res, 404, { error: 'Not found' });
    return true;
  }
  return false;
}

/** Wraps handleApi with uniform error mapping. Returns false only for
 *  non-/api paths (the node entry falls through to static serving). */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    return await handleApi(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) {
      json(res, e.status, { error: e.message });
      return true;
    }
    console.error('[bingo-server] handler error:', e);
    json(res, 500, {
      error: e instanceof Error ? e.message : 'Internal error',
    });
    return true;
  }
}
