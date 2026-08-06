import { describe, test, expect } from 'vitest';
import { erc20Abi } from 'viem';
import {
  parseAmountToBigInt,
  hasRequiredAllowance,
  buildApproveParams,
} from '../approval';

// ─── parseAmountToBigInt ─────────────────────────────────────────────────────

describe('parseAmountToBigInt', () => {
  test('parses integer amount with 18 decimals', () => {
    expect(parseAmountToBigInt('1', 18)).toBe(1_000_000_000_000_000_000n);
  });

  test('parses decimal amount with 18 decimals', () => {
    expect(parseAmountToBigInt('10.5', 18)).toBe(10_500_000_000_000_000_000n);
  });

  test('parses amount with 6 decimals', () => {
    expect(parseAmountToBigInt('10.5', 6)).toBe(10_500_000n);
  });

  test('parses "0" to 0n', () => {
    expect(parseAmountToBigInt('0', 18)).toBe(0n);
  });

  test('parses minimum wei with 18 decimals', () => {
    expect(parseAmountToBigInt('0.000000000000000001', 18)).toBe(1n);
  });

  test('defaults to 18 decimals when not specified', () => {
    expect(parseAmountToBigInt('1')).toBe(1_000_000_000_000_000_000n);
  });

  test('returns 0n for undefined', () => {
    expect(parseAmountToBigInt(undefined)).toBe(0n);
  });

  test('returns 0n for empty string', () => {
    expect(parseAmountToBigInt('')).toBe(0n);
  });

  test('returns 0n for invalid string', () => {
    expect(parseAmountToBigInt('not-a-number')).toBe(0n);
  });
});

// ─── hasRequiredAllowance ────────────────────────────────────────────────────

describe('hasRequiredAllowance', () => {
  test('returns true when allowance exceeds required', () => {
    expect(hasRequiredAllowance(100n, 50n)).toBe(true);
  });

  test('returns true when allowance equals required', () => {
    expect(hasRequiredAllowance(100n, 100n)).toBe(true);
  });

  test('returns false when allowance is less than required', () => {
    expect(hasRequiredAllowance(50n, 100n)).toBe(false);
  });

  test('returns false when allowance is undefined', () => {
    expect(hasRequiredAllowance(undefined, 100n)).toBe(false);
  });

  test('returns true for zero required with zero allowance', () => {
    expect(hasRequiredAllowance(0n, 0n)).toBe(true);
  });
});

// ─── buildApproveParams ─────────────────────────────────────────────────────

describe('buildApproveParams', () => {
  const token = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
  const spender = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

  test('returns correct abi, address, and functionName', () => {
    const result = buildApproveParams(token, spender, '10');
    expect(result.abi).toBe(erc20Abi);
    expect(result.address).toBe(token);
    expect(result.functionName).toBe('approve');
  });

  test('args contain spender and parsed amount (18 decimals)', () => {
    const result = buildApproveParams(token, spender, '10');
    expect(result.args[0]).toBe(spender);
    expect(result.args[1]).toBe(10_000_000_000_000_000_000n);
  });

  test('respects custom decimals', () => {
    const result = buildApproveParams(token, spender, '10', 6);
    expect(result.args[1]).toBe(10_000_000n);
  });

  test('delegates to parseAmountToBigInt for invalid amounts', () => {
    const result = buildApproveParams(token, spender, '');
    expect(result.args[1]).toBe(0n);
  });
});
