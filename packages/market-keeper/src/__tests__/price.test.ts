import { describe, it, expect } from 'vitest';
import { parseYesPrice } from '../utils/price';

describe('parseYesPrice', () => {
  // --- JSON string format (Polymarket Gamma API returns this) ---

  it('parses JSON string with string prices', () => {
    expect(parseYesPrice('["0.65","0.35"]')).toBe(0.65);
  });

  it('parses JSON string with numeric prices', () => {
    expect(parseYesPrice('[0.8, 0.2]')).toBe(0.8);
  });

  it('parses JSON string with 3+ outcomes', () => {
    // Multi-outcome markets have more than 2 prices
    expect(parseYesPrice('["0.25","0.50","0.25"]')).toBe(0.25);
  });

  // --- Number array format ---

  it('parses number array', () => {
    expect(parseYesPrice([0.42, 0.58])).toBe(0.42);
  });

  // --- Boundary values ---

  it('accepts price of exactly 0', () => {
    expect(parseYesPrice('[0, 1]')).toBe(0);
  });

  it('accepts price of exactly 1', () => {
    expect(parseYesPrice('[1, 0]')).toBe(1);
  });

  // --- Invalid / missing input ---

  it('returns undefined for undefined', () => {
    expect(parseYesPrice(undefined)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(parseYesPrice(null as unknown as undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseYesPrice('')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseYesPrice('{not json}')).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(parseYesPrice('[]')).toBeUndefined();
  });

  it('returns undefined for empty number array', () => {
    expect(parseYesPrice([])).toBeUndefined();
  });

  // --- Out of range ---

  it('returns undefined for price > 1', () => {
    expect(parseYesPrice('[1.5, -0.5]')).toBeUndefined();
  });

  it('returns undefined for negative price', () => {
    expect(parseYesPrice('[-0.1, 1.1]')).toBeUndefined();
  });

  it('returns undefined for NaN value', () => {
    expect(parseYesPrice('["not-a-number","0.5"]')).toBeUndefined();
  });
});
