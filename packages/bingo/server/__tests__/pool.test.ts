import { describe, expect, it } from 'vitest';
import {
  activePoolOf,
  poolIsAvailable,
  poolIsOpen,
  validatePool,
} from '../pool.js';
import type { PoolConfig } from '../types.js';

const CONDITION = {
  conditionId: `0x${'ab'.repeat(32)}`,
  resolver: '0xc7a489f8b5cef914fca2511a84cdc0221cd9a0f4',
};

function pool(overrides: Partial<PoolConfig>): PoolConfig {
  return {
    poolId: 'p',
    cutoff: 2_000,
    minCardPriceWei: '1000000000000000000',
    referralBps: 200,
    multiplierBps: [0, 0, 2, 3, 4, 5, 10, 25, 50, 75, 100],
    conditions: Array.from({ length: 16 }, (_, i) => ({
      ...CONDITION,
      conditionId: `0x${i.toString(16).padStart(2, '0').repeat(32)}`,
    })),
    ...overrides,
  } as PoolConfig;
}

describe('validatePool opensAt', () => {
  it('accepts a pool without opensAt (opens immediately)', () => {
    expect(() => validatePool(pool({}))).not.toThrow();
  });

  it('accepts opensAt before the cutoff', () => {
    expect(() => validatePool(pool({ opensAt: 1_000 }))).not.toThrow();
  });

  it('rejects opensAt at/after the cutoff (pool could never be played)', () => {
    expect(() => validatePool(pool({ opensAt: 2_000 }))).toThrow(/opensAt/);
    expect(() => validatePool(pool({ opensAt: 3_000 }))).toThrow(/opensAt/);
  });
});

describe('validatePool dealable filtering', () => {
  // 16 priced conditions: i/20 → 0.00, 0.05, …, 0.75. Those below 0.20 are the
  // first four (0.00, 0.05, 0.10, 0.15); the rest (0.20–0.75) are dealable.
  const priced = (prices: number[]): Partial<PoolConfig> => ({
    conditions: prices.map((estimatedPrice, i) => ({
      ...CONDITION,
      conditionId: `0x${i.toString(16).padStart(2, '0').repeat(32)}`,
      estimatedPrice,
    })) as PoolConfig['conditions'],
  });

  it('drops conditions with odds <0.2 or >0.8 from the dealt set', () => {
    // 18 within-band + 2 extreme → 18 dealable, both extremes removed.
    const within = Array.from({ length: 18 }, (_, i) => 0.2 + i * 0.03); // 0.20–0.71
    const p = validatePool(pool(priced([...within, 0.05, 0.95])));
    expect(p.conditions).toHaveLength(18);
    expect(
      p.conditions.every(
        (c) => (c.estimatedPrice ?? 0.5) >= 0.2 && (c.estimatedPrice ?? 0.5) <= 0.8,
      ),
    ).toBe(true);
  });

  it('keeps conditions with unknown odds (no estimatedPrice)', () => {
    // The base pool() has 16 conditions with no estimatedPrice — all kept.
    expect(validatePool(pool({})).conditions).toHaveLength(16);
  });

  it('does NOT throw when filtering leaves fewer than 16 — marks unavailable', () => {
    // 14 in-band + 6 extreme → only 14 dealable. The pool still validates
    // (no throw) but is "currently unavailable" rather than dealing repeats.
    const within = Array.from({ length: 14 }, (_, i) => 0.2 + i * 0.04);
    const extreme = [0.05, 0.9, 0.95, 0.01, 0.99, 0.85];
    const p = validatePool(pool(priced([...within, ...extreme])));
    expect(p.conditions).toHaveLength(14);
    expect(poolIsAvailable(p)).toBe(false);
  });

  it('a fully-uncertain pool is available', () => {
    expect(poolIsAvailable(validatePool(pool({})))).toBe(true);
  });
});

describe('activePoolOf skips unavailable pools', () => {
  const lowOdds = (): Partial<PoolConfig> => ({
    conditions: Array.from({ length: 16 }, (_, i) => ({
      ...CONDITION,
      conditionId: `0x${i.toString(16).padStart(2, '0').repeat(32)}`,
      estimatedPrice: 0.95, // all near-certain → 0 dealable → unavailable
    })) as PoolConfig['conditions'],
  });

  it('kicks to the previous available pool when the newest is unavailable', () => {
    const a = validatePool(pool({ poolId: 'a', cutoff: 1_000 }));
    const b = validatePool(
      pool({ poolId: 'b', opensAt: 1_000, cutoff: 2_000, ...lowOdds() }),
    );
    // b has opened but can't deal a card — play stays on a.
    expect(activePoolOf([a, b], 1_500).poolId).toBe('a');
  });
});

describe('poolIsOpen', () => {
  it('is closed before opensAt, open between opensAt and cutoff', () => {
    const p = pool({ opensAt: 1_000, cutoff: 2_000 });
    expect(poolIsOpen(p, 999)).toBe(false);
    expect(poolIsOpen(p, 1_000)).toBe(true);
    expect(poolIsOpen(p, 1_999)).toBe(true);
    expect(poolIsOpen(p, 2_000)).toBe(false);
  });

  it('without opensAt behaves as before (open until cutoff)', () => {
    const p = pool({ cutoff: 2_000 });
    expect(poolIsOpen(p, 0)).toBe(true);
    expect(poolIsOpen(p, 2_000)).toBe(false);
  });
});

describe('activePoolOf', () => {
  const a = pool({ poolId: 'a', cutoff: 1_000 });
  const b = pool({ poolId: 'b', opensAt: 1_000, cutoff: 2_000 });
  const c = pool({ poolId: 'c', opensAt: 2_000, cutoff: 3_000 });

  it('is the LAST pool whose opensAt has passed — future pools wait', () => {
    expect(activePoolOf([a, b, c], 500).poolId).toBe('a');
    expect(activePoolOf([a, b, c], 1_500).poolId).toBe('b');
    expect(activePoolOf([a, b, c], 2_500).poolId).toBe('c');
  });

  it('sticks with the newest opened pool even after its cutoff', () => {
    // c never opened in this configuration; b is closed but still the
    // newest opened pool — there is just nothing playable right now.
    expect(activePoolOf([a, b], 5_000).poolId).toBe('b');
  });

  it('falls back to the first pool when none has opened yet', () => {
    expect(activePoolOf([b, c], 0).poolId).toBe('b');
  });

  it('without opensAt fields, the last pool is active (legacy behavior)', () => {
    const x = pool({ poolId: 'x' });
    const y = pool({ poolId: 'y' });
    expect(activePoolOf([x, y], 0).poolId).toBe('y');
  });
});
