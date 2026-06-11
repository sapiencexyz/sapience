import { readFileSync } from 'node:fs';
import { isAddress } from 'viem';
import { CELL_COUNT, LINES_PER_CARD } from './lines.js';
import type { PoolConfig } from './types.js';

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

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
  if (!Array.isArray(raw.conditions) || raw.conditions.length < CELL_COUNT) {
    throw new Error(`pool: need >= ${CELL_COUNT} conditions`);
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
  return raw;
}

export function poolIsOpen(pool: PoolConfig, nowSec = Date.now() / 1000): boolean {
  return nowSec < pool.cutoff;
}
