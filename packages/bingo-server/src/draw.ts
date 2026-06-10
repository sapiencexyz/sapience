import {
  concatHex,
  keccak256,
  pad,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { CELL_COUNT } from './lines.js';
import type { PoolCondition } from './types.js';

/** Published when the pool opens; the secret is revealed after cutoff so
 *  anyone can verify every card was dealt deterministically. */
export function fairnessCommitment(secret: Hex): Hex {
  return keccak256(secret);
}

/** One seed per (pool, player) — one card per wallet per pool by
 *  construction, and the player can't grind layouts without the secret. */
export function cardSeed(secret: Hex, poolId: string, player: Address): Hex {
  return keccak256(
    concatHex([secret, stringToHex(poolId), player.toLowerCase() as Hex]),
  );
}

/** Deterministic partial Fisher-Yates: the first `count` slots of `pool`
 *  shuffled by a keccak chain over `seed`. Re-hashes per step so one seed
 *  yields well-distributed picks (same scheme the old contract used). */
export function drawCells(
  pool: readonly PoolCondition[],
  seed: Hex,
  count = CELL_COUNT,
): PoolCondition[] {
  if (pool.length < count) {
    throw new Error(`Pool too small: ${pool.length} < ${count}`);
  }
  const arr = [...pool];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = keccak256(concatHex([s, pad(toHex(i), { size: 32 })]));
    const j = i + Number(BigInt(s) % BigInt(arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
