import { readFileSync } from 'node:fs';
import { isAddress } from 'viem';
import { CELL_COUNT, LINES_PER_CARD } from './lines.js';
import type { PoolCondition, PoolConfig } from './types.js';

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

// Near-certain markets make dull cells — one side is a foregone conclusion, so
// the YES/NO pick carries no real risk. Drop any condition whose consensus YES
// odds sit outside this band from the dealable set. Conditions with no known
// price are kept (we only exclude on a real signal, never on missing data).
const MIN_CELL_PRICE = 0.2;
const MAX_CELL_PRICE = 0.8;

function isDealableCell(c: PoolCondition): boolean {
  const p = c.estimatedPrice;
  if (typeof p !== 'number' || !Number.isFinite(p)) return true;
  return p >= MIN_CELL_PRICE && p <= MAX_CELL_PRICE;
}

/** A pool is playable only if it has enough dealable conditions to fill a
 *  card. When filtering near-certain markets drops it below CELL_COUNT the
 *  pool is "currently unavailable" — left off the picker and skipped as the
 *  active pool — rather than dealing repeated cells. (conditions are already
 *  filtered to the dealable set by validatePool.) */
export function poolIsAvailable(pool: PoolConfig): boolean {
  return pool.conditions.length >= CELL_COUNT;
}

/** Validates pool config content: a single pool object or an array of
 *  pools (the last entry is the active pool; earlier entries stay
 *  resolvable so historical cards keep their layouts). Pools are deployment
 *  config — rotating pools is a config change, not server state. */
export function parsePools(raw: unknown): PoolConfig[] {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new Error('pool file: no pools');
  const pools = list.map(validatePool);
  const ids = new Set(pools.map((p) => p.poolId));
  if (ids.size !== pools.length) {
    throw new Error('pool file: duplicate poolId');
  }
  return pools;
}

/** parsePools over a file on disk — for node deployments that want to
 *  point POOL_PATH somewhere other than the bundled pool.json. */
export function loadPools(path: string): PoolConfig[] {
  return parsePools(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

/** Validates a pool object. Throws on anything that would make cards
 *  undealable or entitlements ambiguous — fail at creation, not at play. */
export function validatePool(input: unknown): PoolConfig {
  const raw = input as PoolConfig;

  if (!raw || typeof raw !== 'object') throw new Error('pool: object required');
  if (!raw.poolId || typeof raw.poolId !== 'string') {
    throw new Error('pool: poolId required');
  }
  if (!Number.isInteger(raw.cutoff) || raw.cutoff <= 0) {
    throw new Error('pool: cutoff (unix seconds) required');
  }
  if (raw.opensAt !== undefined) {
    if (!Number.isInteger(raw.opensAt) || raw.opensAt <= 0) {
      throw new Error('pool: opensAt must be unix seconds');
    }
    if (raw.opensAt >= raw.cutoff) {
      throw new Error('pool: opensAt must be before cutoff');
    }
  }
  if (!Array.isArray(raw.conditions)) {
    throw new Error('pool: conditions must be an array');
  }
  const seen = new Set<string>();
  for (const c of raw.conditions) {
    if (!BYTES32_RE.test(c.conditionId)) {
      throw new Error(`pool: bad conditionId ${c.conditionId}`);
    }
    if (!isAddress(c.resolver)) {
      throw new Error(`pool: bad resolver ${c.resolver}`);
    }
    // A duplicate pair could land in two cells of one card, which would make
    // the card's lines ambiguous.
    const key = `${c.conditionId.toLowerCase()}:${c.resolver.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`pool: duplicate condition ${key}`);
    seen.add(key);
  }
  // Only the dealable conditions are ever used to draw a card; near-certain
  // markets are dropped here so they never appear on a cell. We do NOT throw
  // when this leaves fewer than CELL_COUNT — such a pool simply becomes
  // "currently unavailable" (poolIsAvailable), so the rest of the config
  // still loads instead of crashing the whole server.
  const dealable = raw.conditions.filter(isDealableCell);
  if (
    !Array.isArray(raw.multiplierBps) ||
    raw.multiplierBps.length !== LINES_PER_CARD + 1 ||
    raw.multiplierBps.some((m) => !Number.isInteger(m) || m < 0)
  ) {
    throw new Error('pool: multiplierBps must be 11 non-negative integers');
  }
  if (
    !Number.isInteger(raw.referralBps) ||
    raw.referralBps < 0 ||
    raw.referralBps > 10_000
  ) {
    throw new Error('pool: referralBps must be 0..10000');
  }
  try {
    if (BigInt(raw.minCardPriceWei) < BigInt(LINES_PER_CARD)) {
      throw new Error('too small');
    }
  } catch {
    throw new Error('pool: minCardPriceWei must be a wei amount >= 10');
  }
  // Hand back the pool with only its dealable conditions — every draw,
  // fairness commitment, and /api/pool response works off this set.
  return { ...raw, conditions: dealable };
}

export function poolIsOpen(pool: PoolConfig, nowSec = Date.now() / 1000): boolean {
  return nowSec >= (pool.opensAt ?? 0) && nowSec < pool.cutoff;
}

/** The pool players see/play right now: the LAST pool whose opensAt has
 *  passed AND that's still available (enough dealable conditions). Future
 *  pools sit in the file invisible until their time comes — scheduling is
 *  committing them ahead with opensAt set (typically the previous pool's
 *  cutoff). An opened-but-unavailable pool is skipped so play kicks to the
 *  next available one. Falls back to the first available pool (then the very
 *  first) when nothing else qualifies. */
export function activePoolOf(
  pools: readonly PoolConfig[],
  nowSec = Date.now() / 1000,
): PoolConfig {
  for (let i = pools.length - 1; i >= 0; i--) {
    if ((pools[i].opensAt ?? 0) <= nowSec && poolIsAvailable(pools[i])) {
      return pools[i];
    }
  }
  return pools.find(poolIsAvailable) ?? pools[0];
}
