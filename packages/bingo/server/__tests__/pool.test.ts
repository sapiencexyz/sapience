import { describe, expect, it } from 'vitest';
import { activePoolOf, poolIsOpen, validatePool } from '../pool.js';
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
