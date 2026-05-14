import { describe, it, expect } from 'vitest';
import { MAX_SKIP, MAX_TAKE, clampSkip, clampTake } from './pagination';

describe('clampTake', () => {
  it('returns defaultTake when value is null', () => {
    expect(clampTake(null, { defaultTake: 50 })).toBe(50);
  });

  it('returns defaultTake when value is undefined', () => {
    expect(clampTake(undefined, { defaultTake: 25 })).toBe(25);
  });

  it('returns defaultTake when value is 0', () => {
    expect(clampTake(0, { defaultTake: 20 })).toBe(20);
  });

  it('returns defaultTake when value is negative', () => {
    expect(clampTake(-5, { defaultTake: 30 })).toBe(30);
  });

  it('returns defaultTake when value is NaN', () => {
    expect(clampTake(Number.NaN, { defaultTake: 30 })).toBe(30);
  });

  it('returns defaultTake when value is Infinity (not finite)', () => {
    expect(clampTake(Number.POSITIVE_INFINITY, { defaultTake: 30 })).toBe(30);
  });

  it('returns the value when within [1, maxTake]', () => {
    expect(clampTake(42, { defaultTake: 50 })).toBe(42);
  });

  it('caps at MAX_TAKE by default', () => {
    expect(clampTake(9_999, { defaultTake: 50 })).toBe(MAX_TAKE);
  });

  it('caps at a per-resolver maxTake override', () => {
    expect(clampTake(9_999, { defaultTake: 50, maxTake: 500 })).toBe(500);
  });

  it('floors fractional input', () => {
    expect(clampTake(3.9, { defaultTake: 50 })).toBe(3);
  });

  it('treats fallback as MIN(defaultTake, maxTake) when invalid input + low cap', () => {
    // defaultTake exceeds maxTake — the fallback should still respect maxTake.
    expect(clampTake(null, { defaultTake: 200, maxTake: 50 })).toBe(50);
  });
});

describe('clampSkip', () => {
  it('returns 0 when value is null', () => {
    expect(clampSkip(null)).toBe(0);
  });

  it('returns 0 when value is undefined', () => {
    expect(clampSkip(undefined)).toBe(0);
  });

  it('returns 0 when value is negative', () => {
    expect(clampSkip(-100)).toBe(0);
  });

  it('returns 0 when value is NaN', () => {
    expect(clampSkip(Number.NaN)).toBe(0);
  });

  it('returns 0 when value is Infinity', () => {
    expect(clampSkip(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns the value when within [0, MAX_SKIP]', () => {
    expect(clampSkip(500)).toBe(500);
  });

  it('caps at MAX_SKIP by default', () => {
    expect(clampSkip(9_999_999)).toBe(MAX_SKIP);
  });

  it('caps at a per-resolver maxSkip override (positions uses 10_000)', () => {
    expect(clampSkip(9_999_999, { maxSkip: 10_000 })).toBe(10_000);
  });

  it('floors fractional input', () => {
    expect(clampSkip(50.9)).toBe(50);
  });

  it('passes through 0', () => {
    expect(clampSkip(0)).toBe(0);
  });
});

describe('cap constants', () => {
  it('MAX_TAKE is 100 (any change needs a deliberate audit of cost)', () => {
    expect(MAX_TAKE).toBe(100);
  });

  it('MAX_SKIP is 1000 (offset beyond this should be cursor-paginated)', () => {
    expect(MAX_SKIP).toBe(1000);
  });
});
