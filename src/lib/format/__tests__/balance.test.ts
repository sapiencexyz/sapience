import { describe, expect, it } from 'vitest';
import {
  formatBalance,
  formatDollarLikeBalance,
  formatTokenInput,
  formatUsd,
} from '~/lib/format/balance';

describe('formatDollarLikeBalance', () => {
  it.each([
    [1234.567, '1,234.57'],
    [100, '100.00'],
    [62.9, '62.90'],
    [0, '0.00'],
    ['250.5', '250.50'],
  ])('%s → %s', (input, expected) => {
    expect(formatDollarLikeBalance(input as number | string)).toBe(expected);
  });

  it('returns "0.00" for NaN', () => {
    expect(formatDollarLikeBalance('not-a-number')).toBe('0.00');
  });
});

describe('formatBalance', () => {
  it('caps fraction at maxDecimals', () => {
    expect(formatBalance(1.123456, 4)).toBe('1.1235');
  });
  it('adds thousands separators', () => {
    expect(formatBalance(1234567.89, 2)).toBe('1,234,567.89');
  });
});

describe('formatUsd', () => {
  it('returns em dash for zero', () => {
    expect(formatUsd(0)).toBe('—');
  });
  it('formats with $ and 2 decimals max', () => {
    expect(formatUsd(1234.5678)).toBe('$1,234.57');
    expect(formatUsd(100)).toBe('$100');
  });
});

describe('formatTokenInput', () => {
  it('trims trailing zeros', () => {
    expect(formatTokenInput(1_500_000_000_000_000_000n, 18)).toBe('1.5');
  });
  it('drops the decimal point when fully zero', () => {
    expect(formatTokenInput(2_000_000_000_000_000_000n, 18)).toBe('2');
  });
  it('caps fraction at maxDecimals', () => {
    expect(formatTokenInput(1_123_456_789_000_000_000n, 18, 4)).toBe('1.1234');
  });
  it('handles wei-level dust with default decimals', () => {
    expect(formatTokenInput(1n, 18)).toBe('0');
  });
});
