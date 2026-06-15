import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex, type Address, type Hex } from 'viem';
import { cardSeed, cardTag, drawCells, fairnessCommitment } from '../draw.js';
import { buildLines, CELL_COUNT, LINES_PER_CARD } from '../lines.js';
import type { PoolCondition } from '../types.js';

const SECRET: Hex =
  '0x59a55e164a1cdde621e7e2da7e8b853c8d8e6cd5fbab21001f547633a26ce0fe';
const PLAYER: Address = '0xB0B0000000000000000000000000000000000B0b';

function makePool(n: number): PoolCondition[] {
  return Array.from({ length: n }, (_, i) => ({
    conditionId: keccak256(stringToHex(`cond-${i}`)),
    resolver: `0x${(0xc0de000 + i).toString(16).padStart(40, '0')}` as Address,
  }));
}

describe('cardSeed', () => {
  it('is deterministic and case-insensitive on the player address', () => {
    const a = cardSeed(SECRET, 'pool-1', PLAYER, 0);
    const b = cardSeed(SECRET, 'pool-1', PLAYER.toLowerCase() as Address, 0);
    expect(a).toEqual(b);
  });

  it('differs across card indexes (each card gets its own layout)', () => {
    const a = cardSeed(SECRET, 'pool-1', PLAYER, 0);
    const b = cardSeed(SECRET, 'pool-1', PLAYER, 1);
    expect(a).not.toEqual(b);
    const pool = makePool(22);
    expect(drawCells(pool, a).map((c) => c.conditionId)).not.toEqual(
      drawCells(pool, b).map((c) => c.conditionId),
    );
  });

  it('differs across players, pools, and secrets', () => {
    const base = cardSeed(SECRET, 'pool-1', PLAYER, 0);
    expect(cardSeed(SECRET, 'pool-2', PLAYER, 0)).not.toEqual(base);
    expect(
      cardSeed(SECRET, 'pool-1', '0x000000000000000000000000000000000000dEaD', 0),
    ).not.toEqual(base);
    expect(
      cardSeed(fairnessCommitment(SECRET), 'pool-1', PLAYER, 0),
    ).not.toEqual(base);
  });
});

describe('drawCells', () => {
  it('deals 16 unique cells from the pool, deterministically', () => {
    const pool = makePool(22);
    const seed = cardSeed(SECRET, 'pool-1', PLAYER, 0);
    const a = drawCells(pool, seed);
    const b = drawCells(pool, seed);
    expect(a).toEqual(b);
    expect(a).toHaveLength(CELL_COUNT);
    const ids = new Set(a.map((c) => c.conditionId));
    expect(ids.size).toBe(CELL_COUNT);
    for (const c of a) expect(pool).toContainEqual(c);
  });

  it('does not mutate the pool', () => {
    const pool = makePool(22);
    const copy = JSON.parse(JSON.stringify(pool));
    drawCells(pool, cardSeed(SECRET, 'pool-1', PLAYER, 0));
    expect(pool).toEqual(copy);
  });

  it('different seeds give different layouts', () => {
    const pool = makePool(22);
    const a = drawCells(pool, cardSeed(SECRET, 'pool-1', PLAYER, 0));
    const b = drawCells(
      pool,
      cardSeed(SECRET, 'pool-1', '0x000000000000000000000000000000000000dEaD', 0),
    );
    expect(a.map((c) => c.conditionId)).not.toEqual(
      b.map((c) => c.conditionId),
    );
  });

  it('rejects pools smaller than a card', () => {
    expect(() =>
      drawCells(makePool(15), cardSeed(SECRET, 'pool-1', PLAYER, 0)),
    ).toThrow(/Pool too small/);
  });
});

describe('buildLines', () => {
  it('builds the canonical 10 lines covering all 16 cells', () => {
    const lines = buildLines();
    expect(lines).toHaveLength(LINES_PER_CARD);
    const covered = new Set(lines.flatMap((l) => l.cellIndices));
    expect(covered.size).toBe(CELL_COUNT);
    for (const l of lines) {
      expect(new Set(l.cellIndices).size).toBe(4);
    }
  });
});

describe('cardTag', () => {
  it('is deterministic, card-specific, and bngo-prefixed', () => {
    const a = cardTag('pool-1', PLAYER, 0);
    expect(a).toEqual(cardTag('pool-1', PLAYER.toLowerCase() as Address, 0));
    expect(a).not.toEqual(cardTag('pool-1', PLAYER, 1));
    expect(a).not.toEqual(cardTag('pool-2', PLAYER, 0));
    expect(a.startsWith('0x626e676f')).toBe(true); // ascii 'bngo'
    expect(a).toHaveLength(66); // bytes32
  });
});
