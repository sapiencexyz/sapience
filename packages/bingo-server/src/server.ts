import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { isAddress, type Address, type Hex } from 'viem';
import {
  isValidAdminSession,
  issueNonce,
  siweLogin,
} from './adminAuth.js';
import { env } from './config.js';
import { cardSeed, drawCells, fairnessCommitment } from './draw.js';
import { allEntitlements, fundedFlags } from './entitlements.js';
import { buildLines, LINES_PER_CARD } from './lines.js';
import { loadPool, poolIsOpen, validatePool } from './pool.js';
import {
  ensureReceiptMinted,
  minterAddress,
  receiptEnabled,
  receiptTokenId,
} from './receipt.js';
import { restoreSessionClient, validateSerializedSession } from './session.js';
import { Store } from './store.js';
import { submitLines } from './submitLines.js';
import type {
  CardSubmission,
  PoolConfig,
  PoolRecord,
  SerializedSession,
} from './types.js';

const store = new Store(env.DATA_DIR);
// Bootstrap pool: config file + env secret. Admin-created pools (journaled,
// each with its own server-generated secret) take precedence as the active
// pool; old pools stay resolvable so historical cards keep their layouts.
store.seedPool({
  pool: loadPool(env.POOL_PATH),
  secret: env.SERVER_SECRET as Hex,
  createdAt: 0,
});

function activePool(): PoolRecord {
  const rec = store.activePool();
  if (!rec) throw new Error('No pool configured');
  return rec;
}

{
  const { pool, secret } = activePool();
  console.log(
    `[bingo-server] pool=${pool.poolId} cutoff=${new Date(pool.cutoff * 1000).toISOString()} ` +
      `conditions=${pool.conditions.length} commitment=${fairnessCommitment(secret)}`,
  );
}
if (receiptEnabled()) {
  void minterAddress().then((a) =>
    console.log(
      `[receipt] minter smart account: ${a} — must be the contract's minter`,
    ),
  );
} else {
  console.log('[receipt] disabled (no RECEIPT_CONTRACT_ADDRESS/MINTER_PRIVATE_KEY)');
}

// ---------------------------------------------------------------------------
// Submission runner
// ---------------------------------------------------------------------------

/** player:poolId keys with a run in flight — one submission run at a time. */
const inFlight = new Set<string>();

async function runSubmission(sub: CardSubmission): Promise<void> {
  const key = `${sub.player.toLowerCase()}:${sub.poolId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const session = store.getSession(sub.player);
    if (!session) throw new Error('No active session for player');
    const sessionClient = await restoreSessionClient(session);
    const record = store.getPool(sub.poolId);
    if (!record) throw new Error(`Unknown pool ${sub.poolId}`);
    const seed = cardSeed(record.secret, sub.poolId, sub.player);
    const cells = drawCells(record.pool.conditions, seed);
    // The on-chain record (receipt NFT) — non-blocking; play proceeds even
    // if the mint fails, and the mint is idempotent on retries.
    void ensureReceiptMinted(sub, seed);
    store.setProgress(
      sub.player,
      sub.poolId,
      buildLines().map((l) => ({ lineId: l.id, status: 'pending' as const })),
    );
    await submitLines({
      sessionClient,
      smartAccountAddress: sub.player,
      cells,
      yesMask: sub.yesMask,
      stakePerLineWei: BigInt(sub.cardPriceWei) / BigInt(LINES_PER_CARD),
      alreadyFundedLineIds: store.fundedLineIds(sub.player, sub.poolId),
      onProgress: (lineId, status, extra) => {
        store.updateProgress(sub.player, sub.poolId, lineId, {
          status,
          ...extra,
        });
        // Journal funded lines so entitlements survive the player later
        // redeeming (burning) the position tokens.
        if (status === 'done') {
          store.markLineFunded(sub.player, sub.poolId, lineId);
        }
      },
    });
  } catch (e) {
    console.error(`[bingo-server] submission run failed for ${key}:`, e);
    // Surface the run-level failure on any line still pending.
    const msg = e instanceof Error ? e.message : String(e);
    for (const l of store.getProgress(sub.player, sub.poolId) ?? []) {
      if (l.status === 'pending') {
        store.updateProgress(sub.player, sub.poolId, l.lineId, {
          status: 'failed',
          error: msg,
        });
      }
    }
  } finally {
    inFlight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

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

function isAdmin(req: IncomingMessage): boolean {
  const auth = req.headers.authorization ?? '';
  // SIWE-issued session token (the admin UI path).
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer && isValidAdminSession(bearer)) return true;
  // Static token fallback (scripts/curl).
  const got = Buffer.from(auth);
  const want = Buffer.from(`Bearer ${env.ADMIN_TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Thrown by request parsing to produce a client error instead of a 500. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

// ---------------------------------------------------------------------------
// Static frontend (the built Vite app) — one service serves both halves.
// ---------------------------------------------------------------------------

const STATIC_DIR = resolve(env.STATIC_DIR);
const STATIC_AVAILABLE = existsSync(join(STATIC_DIR, 'index.html'));
if (!STATIC_AVAILABLE) {
  console.log(
    `[bingo-server] no frontend build at ${STATIC_DIR} — API-only mode ` +
      '(dev: run the Vite dev server, it proxies /api here)',
  );
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/** GET-only static serving with SPA fallback to index.html. */
function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): boolean {
  if (!STATIC_AVAILABLE || req.method !== 'GET') return false;
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  let file = normalize(join(STATIC_DIR, rel));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(STATIC_DIR, 'index.html');
  }
  const isIndex = file.endsWith('index.html');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    // Vite emits content-hashed asset names; only index.html must revalidate.
    'cache-control': isIndex
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(res);
  return true;
}

// Funded flags are 20 RPC reads per card — cache briefly per player.
const fundedCache = new Map<string, { at: number; flags: boolean[] }>();
const FUNDED_CACHE_MS = 15_000;

async function cachedFundedFlags(
  player: Address,
  yesMask: number,
): Promise<boolean[]> {
  const key = player.toLowerCase();
  const hit = fundedCache.get(key);
  if (hit && Date.now() - hit.at < FUNDED_CACHE_MS) return hit.flags;
  const flags = await fundedFlags(activePool(), store, player, yesMask);
  fundedCache.set(key, { at: Date.now(), flags });
  return flags;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    });
    res.end();
    return;
  }

  if (route === 'GET /api/health') {
    return json(res, 200, { ok: true });
  }

  if (route === 'GET /api/pool') {
    const { pool, secret } = activePool();
    return json(res, 200, {
      poolId: pool.poolId,
      cutoff: pool.cutoff,
      open: poolIsOpen(pool),
      conditions: pool.conditions,
      multiplierBps: pool.multiplierBps,
      referralBps: pool.referralBps,
      minCardPriceWei: pool.minCardPriceWei,
      fairnessCommitment: fairnessCommitment(secret),
      receiptContract: env.RECEIPT_CONTRACT_ADDRESS || null,
    });
  }

  if (route === 'GET /api/fairness') {
    return json(res, 200, {
      scheme:
        'seed = keccak256(secret ‖ utf8(poolId) ‖ player); ' +
        'layout = partial Fisher-Yates over pool conditions, ' +
        'rehashing keccak256(seed ‖ pad32(i)) per step',
      pools: store.allPools().map(({ pool, secret }) => ({
        poolId: pool.poolId,
        cutoff: pool.cutoff,
        commitment: fairnessCommitment(secret),
        // The secret is only revealed once the pool can no longer be played.
        ...(poolIsOpen(pool) ? {} : { secret }),
      })),
    });
  }

  if (route === 'POST /api/session') {
    const body = await readJson<SerializedSession>(req);
    const invalid = validateSerializedSession(body);
    if (invalid) return json(res, 400, { error: invalid });
    // Restore once now so a bad approval fails at registration, not at play.
    try {
      await restoreSessionClient(body);
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    store.putSession(body);
    return json(res, 200, { player: body.config.smartAccountAddress });
  }

  if (route === 'GET /api/card') {
    const player = url.searchParams.get('player');
    if (!player || !isAddress(player)) {
      return json(res, 400, { error: 'player query param required' });
    }
    const { pool, secret } = activePool();
    const cells = drawCells(
      pool.conditions,
      cardSeed(secret, pool.poolId, player),
    );
    const submission = store.getSubmission(player, pool.poolId);
    const progress = store.getProgress(player, pool.poolId);
    const funded = submission
      ? await cachedFundedFlags(player, submission.yesMask)
      : undefined;
    const receipt = submission
      ? await receiptTokenId(pool.poolId, player).catch(() => null)
      : null;
    const lines = buildLines().map((l, i) => ({
      lineId: l.id,
      cellIndices: l.cellIndices,
      funded: funded?.[i] ?? false,
      status: progress?.find((p) => p.lineId === l.id)?.status,
      error: progress?.find((p) => p.lineId === l.id)?.error,
    }));
    return json(res, 200, {
      poolId: pool.poolId,
      cutoff: pool.cutoff,
      open: poolIsOpen(pool),
      player,
      cells,
      yesMask: submission?.yesMask ?? null,
      cardPriceWei: submission?.cardPriceWei ?? null,
      submittedAt: submission?.submittedAt ?? null,
      hasSession: !!store.getSession(player),
      receiptTokenId: receipt?.toString() ?? null,
      lines,
    });
  }

  if (route === 'POST /api/card/submit') {
    const body = await readJson<{
      player?: string;
      yesMask?: number;
      cardPriceWei?: string;
      ref?: string;
    }>(req);
    const { player, yesMask, cardPriceWei, ref } = body;
    const { pool } = activePool();
    if (!player || !isAddress(player)) {
      return json(res, 400, { error: 'player required' });
    }
    if (
      typeof yesMask !== 'number' ||
      !Number.isInteger(yesMask) ||
      yesMask < 0 ||
      yesMask > 0xffff
    ) {
      return json(res, 400, { error: 'yesMask must be 0..65535' });
    }
    let price: bigint;
    try {
      price = BigInt(cardPriceWei ?? '');
    } catch {
      return json(res, 400, { error: 'cardPriceWei required (wei string)' });
    }
    if (price < BigInt(pool.minCardPriceWei)) {
      return json(res, 400, { error: 'cardPriceWei below pool minimum' });
    }
    if (price % BigInt(LINES_PER_CARD) !== 0n) {
      return json(res, 400, { error: 'cardPriceWei must be divisible by 10' });
    }
    if (ref !== undefined && ref !== null && !isAddress(ref)) {
      return json(res, 400, { error: 'ref must be an address' });
    }
    if (!poolIsOpen(pool)) {
      return json(res, 409, { error: 'Pool is closed (cutoff passed)' });
    }
    if (!store.getSession(player)) {
      return json(res, 401, { error: 'No active session — POST /session first' });
    }

    const existing = store.getSubmission(player, pool.poolId);
    let submission: CardSubmission;
    if (existing) {
      // Retry path: sides + price are locked to the first submission so the
      // already-funded lines stay coherent with the rest of the card.
      if (
        existing.yesMask !== yesMask ||
        existing.cardPriceWei !== String(price)
      ) {
        return json(res, 409, {
          error: 'Card already submitted with different sides/price',
        });
      }
      submission = existing;
    } else {
      submission = {
        player,
        poolId: pool.poolId,
        yesMask,
        cardPriceWei: price.toString(),
        ref: (ref as Address | undefined) ?? null,
        submittedAt: Date.now(),
      };
      store.putSubmission(submission);
    }

    void runSubmission(submission);
    return json(res, 202, { accepted: true, poolId: pool.poolId });
  }

  if (route === 'GET /api/admin/nonce') {
    return json(res, 200, { nonce: issueNonce() });
  }

  if (route === 'POST /api/admin/login') {
    const body = await readJson<{ message?: string; signature?: string }>(
      req,
    );
    if (!body.message || !body.signature?.startsWith('0x')) {
      return json(res, 400, { error: 'message and signature required' });
    }
    try {
      const session = await siweLogin(body.message, body.signature as Hex);
      return json(res, 200, session);
    } catch (e) {
      return json(res, 401, {
        error: e instanceof Error ? e.message : 'Login failed',
      });
    }
  }

  if (route === 'POST /api/admin/pool') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    const body = await readJson<unknown>(req);
    let cfg: PoolConfig;
    try {
      cfg = validatePool(body);
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : 'Invalid pool',
      });
    }
    if (cfg.cutoff <= Date.now() / 1000) {
      return json(res, 400, { error: 'cutoff must be in the future' });
    }
    // Fresh fairness secret per pool, committed now, revealed after cutoff.
    const secret = `0x${randomBytes(32).toString('hex')}` as Hex;
    try {
      store.putPool({ pool: cfg, secret, createdAt: Date.now() });
    } catch (e) {
      return json(res, 409, {
        error: e instanceof Error ? e.message : 'Pool exists',
      });
    }
    console.log(`[bingo-server] pool ${cfg.poolId} created (now active)`);
    return json(res, 200, {
      poolId: cfg.poolId,
      cutoff: cfg.cutoff,
      fairnessCommitment: fairnessCommitment(secret),
      active: true,
    });
  }

  if (route === 'GET /api/admin/entitlements') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    const rows = await allEntitlements(store);
    const totalBonus = rows.reduce(
      (s, r) => s + BigInt(r.bonusOwedWei ?? '0'),
      0n,
    );
    const totalReferral = rows.reduce(
      (s, r) => s + BigInt(r.referralOwedWei ?? '0'),
      0n,
    );
    return json(res, 200, {
      poolId: activePool().pool.poolId,
      rows: rows.map((r) => ({
        ...r,
        payouts: store.payoutsFor(r.player, r.poolId),
      })),
      totalBonusOwedWei: totalBonus.toString(),
      totalReferralOwedWei: totalReferral.toString(),
    });
  }

  if (route === 'POST /api/admin/payouts') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    const body = await readJson<{
      player?: string;
      kind?: string;
      amountWei?: string;
      to?: string;
      txHash?: string;
    }>(req);
    if (
      !body.player ||
      !isAddress(body.player) ||
      (body.kind !== 'bonus' && body.kind !== 'referral') ||
      !body.amountWei ||
      !body.to ||
      !isAddress(body.to)
    ) {
      return json(res, 400, {
        error: 'player, kind (bonus|referral), amountWei, to required',
      });
    }
    store.markPayout({
      player: body.player,
      poolId: activePool().pool.poolId,
      kind: body.kind,
      amountWei: body.amountWei,
      to: body.to,
      txHash: body.txHash,
    });
    return json(res, 200, { ok: true });
  }

  if (url.pathname.startsWith('/api/')) {
    return json(res, 404, { error: 'Not found' });
  }
  if (serveStatic(req, res, url)) return;
  json(res, 404, { error: 'Not found' });
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (e instanceof HttpError) {
      json(res, e.status, { error: e.message });
      return;
    }
    console.error('[bingo-server] handler error:', e);
    json(res, 500, { error: e instanceof Error ? e.message : 'Internal error' });
  });
}).listen(env.PORT, () => {
  console.log(`[bingo-server] listening on :${env.PORT}`);
});

// Resume after a restart: any accepted submission with unfunded lines gets
// its run re-enqueued (idempotent — already-funded lines are skipped). Lost
// in-memory progress is rebuilt by the run itself.
for (const sub of store.allSubmissions()) {
  const record = store.getPool(sub.poolId);
  if (!record || !poolIsOpen(record.pool)) continue;
  if (store.fundedLineIds(sub.player, sub.poolId).size >= LINES_PER_CARD) {
    continue;
  }
  console.log(`[bingo-server] resuming submission for ${sub.player}`);
  void runSubmission(sub);
}
