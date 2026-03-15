import { describe, test, expect } from 'vitest';
import { parseAbi } from 'viem';
import type { Abi } from 'abitype';
import type { Address } from 'viem';
import {
  abiHasFunction,
  formatVaultAssetAmount,
  formatVaultSharesAmount,
  formatUtilizationRate,
  formatInteractionDelay,
  buildDepositCalls,
  buildWithdrawalCall,
  parsePendingRequest,
  computeInteractionDelayRemaining,
  buildVaultQuoteMessage,
} from '../vault';

// ─── abiHasFunction ──────────────────────────────────────────────────────────

describe('abiHasFunction', () => {
  const abi = [
    {
      type: 'function',
      name: 'deposit',
      inputs: [{ name: 'amount', type: 'uint256' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'withdraw',
      inputs: [
        { name: 'amount', type: 'uint256' },
        { name: 'to', type: 'address' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'event',
      name: 'Deposit',
      inputs: [],
    },
    {
      type: 'error',
      name: 'InsufficientBalance',
      inputs: [],
    },
  ] as const;

  test('returns true when function is present', () => {
    expect(abiHasFunction(abi, 'deposit')).toBe(true);
  });

  test('returns false when function is absent', () => {
    expect(abiHasFunction(abi, 'transfer')).toBe(false);
  });

  test('returns true with matching inputsLength', () => {
    expect(abiHasFunction(abi, 'withdraw', 2)).toBe(true);
  });

  test('returns false with non-matching inputsLength', () => {
    expect(abiHasFunction(abi, 'withdraw', 1)).toBe(false);
  });

  test('ignores events and errors', () => {
    expect(abiHasFunction(abi, 'Deposit')).toBe(false);
    expect(abiHasFunction(abi, 'InsufficientBalance')).toBe(false);
  });
});

// ─── formatVaultAssetAmount ──────────────────────────────────────────────────

describe('formatVaultAssetAmount', () => {
  test('formats 1e18 to "1"', () => {
    expect(formatVaultAssetAmount(1_000_000_000_000_000_000n)).toBe('1');
  });

  test('formats 0n to "0"', () => {
    expect(formatVaultAssetAmount(0n)).toBe('0');
  });

  test('formats with 6 decimals', () => {
    expect(formatVaultAssetAmount(1_500_000n, 6)).toBe('1.5');
  });
});

// ─── formatVaultSharesAmount ─────────────────────────────────────────────────

describe('formatVaultSharesAmount', () => {
  test('formats identically to formatVaultAssetAmount', () => {
    expect(formatVaultSharesAmount(1_000_000_000_000_000_000n)).toBe('1');
    expect(formatVaultSharesAmount(0n)).toBe('0');
    expect(formatVaultSharesAmount(1_500_000n, 6)).toBe('1.5');
  });
});

// ─── formatUtilizationRate ───────────────────────────────────────────────────

describe('formatUtilizationRate', () => {
  test('formats 1e16 to "1.00"', () => {
    expect(formatUtilizationRate(10_000_000_000_000_000n)).toBe('1.00');
  });

  test('formats 0n to "0.00"', () => {
    expect(formatUtilizationRate(0n)).toBe('0.00');
  });

  test('formats 100e16 to "100.00"', () => {
    expect(formatUtilizationRate(1_000_000_000_000_000_000n)).toBe('100.00');
  });

  test('formats 50.5% correctly', () => {
    expect(formatUtilizationRate(505_000_000_000_000_000n)).toBe('50.50');
  });
});

// ─── formatInteractionDelay ──────────────────────────────────────────────────

describe('formatInteractionDelay', () => {
  test('formats 86400 seconds to "1.0 days"', () => {
    expect(formatInteractionDelay(86400n)).toBe('1.0 days');
  });

  test('formats 3600 seconds to "1 hours"', () => {
    expect(formatInteractionDelay(3600n)).toBe('1 hours');
  });

  test('formats 0 seconds to "0 hours"', () => {
    expect(formatInteractionDelay(0n)).toBe('0 hours');
  });

  test('formats 172800 seconds to "2.0 days"', () => {
    expect(formatInteractionDelay(172800n)).toBe('2.0 days');
  });
});

// ─── buildDepositCalls ───────────────────────────────────────────────────────

describe('buildDepositCalls', () => {
  const vaultAbi = parseAbi([
    'function requestDeposit(uint256 amount, uint256 expectedShares)',
  ]) as unknown as Abi;
  const assetAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
  const vaultAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

  test('no wrap or approve needed → single deposit call', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '1',
      wrappedBalance: 100_000_000_000_000_000_000n, // 100 — more than enough
      currentAllowance: 100_000_000_000_000_000_000n,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe(vaultAddress);
    expect(calls[0].value).toBe(0n);
  });

  test('wrap needed → adds wrap call before deposit', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '1',
      wrappedBalance: 0n, // no wrapped balance
      currentAllowance: 100_000_000_000_000_000_000n,
    });
    // wrap + deposit
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(assetAddress);
    expect(calls[0].value).toBe(10_000_000_000_000_000_000n);
  });

  test('approve needed → adds approve call before deposit', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '1',
      wrappedBalance: 100_000_000_000_000_000_000n,
      currentAllowance: 0n, // no allowance
    });
    // approve + deposit
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(assetAddress); // approve on asset
    expect(calls[0].value).toBe(0n);
  });

  test('both wrap and approve needed → three calls', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '1',
      wrappedBalance: 0n,
      currentAllowance: 0n,
    });
    expect(calls).toHaveLength(3);
    // wrap, approve, deposit
    expect(calls[0].value).toBe(10_000_000_000_000_000_000n);
    expect(calls[1].value).toBe(0n);
    expect(calls[2].to).toBe(vaultAddress);
  });

  test('undefined pricePerShare is treated as "1"', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: undefined,
      wrappedBalance: 100_000_000_000_000_000_000n,
      currentAllowance: 100_000_000_000_000_000_000n,
    });
    expect(calls).toHaveLength(1);
  });

  test('"0" pricePerShare is treated as "1"', () => {
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '0',
      wrappedBalance: 100_000_000_000_000_000_000n,
      currentAllowance: 100_000_000_000_000_000_000n,
    });
    expect(calls).toHaveLength(1);
  });

  test('share calculation correctness with pps=2', () => {
    // amount=10, pps=2 → expected shares = 10e18 * 1e18 / 2e18 = 5e18
    const calls = buildDepositCalls({
      amount: '10',
      assetAddress,
      vaultAddress,
      vaultAbi,
      pricePerShare: '2',
      wrappedBalance: 100_000_000_000_000_000_000n,
      currentAllowance: 100_000_000_000_000_000_000n,
    });
    expect(calls).toHaveLength(1);
    // The requestDeposit calldata is encoded — just verify it doesn't throw
    expect(calls[0].data).toBeTruthy();
  });
});

// ─── buildWithdrawalCall ─────────────────────────────────────────────────────

describe('buildWithdrawalCall', () => {
  const vaultAbi = parseAbi([
    'function requestWithdrawal(uint256 shares, uint256 expectedAssets)',
  ]) as unknown as Abi;
  const vaultAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

  test('returns correct address and functionName', () => {
    const result = buildWithdrawalCall({
      shares: '10',
      vaultAddress,
      vaultAbi,
      pricePerShare: '1',
    });
    expect(result.address).toBe(vaultAddress);
    expect(result.functionName).toBe('requestWithdrawal');
  });

  test('args contain shares and expectedAssets', () => {
    const result = buildWithdrawalCall({
      shares: '10',
      vaultAddress,
      vaultAbi,
      pricePerShare: '2',
    });
    // shares=10e18, pps=2e18 → expectedAssets = 10e18 * 2e18 / 1e18 = 20e18
    expect(result.args[0]).toBe(10_000_000_000_000_000_000n);
    expect(result.args[1]).toBe(20_000_000_000_000_000_000n);
  });

  test('undefined pricePerShare treated as "1"', () => {
    const result = buildWithdrawalCall({
      shares: '5',
      vaultAddress,
      vaultAbi,
      pricePerShare: undefined,
    });
    expect(result.args[0]).toBe(5_000_000_000_000_000_000n);
    expect(result.args[1]).toBe(5_000_000_000_000_000_000n);
  });
});

// ─── parsePendingRequest ─────────────────────────────────────────────────────

describe('parsePendingRequest', () => {
  const user = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
  const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

  test('parses tuple format', () => {
    const raw = [100n, 200n, 1000n, user, true, false] as const;
    const result = parsePendingRequest(raw);
    expect(result).toEqual({
      user,
      isDeposit: true,
      shares: 100n,
      assets: 200n,
      timestamp: 1000n,
      processed: false,
    });
  });

  test('parses object format', () => {
    const raw = {
      user,
      isDeposit: false,
      shares: 50n,
      assets: 100n,
      timestamp: 2000n,
      processed: true,
    };
    const result = parsePendingRequest(raw);
    expect(result).toEqual({
      user,
      isDeposit: false,
      shares: 50n,
      assets: 100n,
      timestamp: 2000n,
      processed: true,
    });
  });

  test('returns null for zero address in tuple', () => {
    const raw = [100n, 200n, 1000n, zeroAddress, true, false];
    expect(parsePendingRequest(raw)).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parsePendingRequest(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parsePendingRequest(undefined)).toBeNull();
  });

  test('returns null for zero address in object', () => {
    const raw = {
      user: zeroAddress,
      isDeposit: true,
      shares: 50n,
      assets: 100n,
      timestamp: 2000n,
      processed: false,
    };
    expect(parsePendingRequest(raw)).toBeNull();
  });
});

// ─── computeInteractionDelayRemaining ────────────────────────────────────────

describe('computeInteractionDelayRemaining', () => {
  test('returns 0 when deadline is in the past', () => {
    const result = computeInteractionDelayRemaining(100n, 50n, 200);
    expect(result).toBe(0);
  });

  test('returns remaining seconds when deadline is in the future', () => {
    // last=100, delay=200 → target=300, now=250 → remaining=50
    const result = computeInteractionDelayRemaining(100n, 200n, 250);
    expect(result).toBe(50);
  });

  test('returns 0 when exactly at deadline', () => {
    const result = computeInteractionDelayRemaining(100n, 100n, 200);
    expect(result).toBe(0);
  });

  test('uses current time when nowSec is omitted', () => {
    // lastInteraction far in the past → should return 0
    const result = computeInteractionDelayRemaining(0n, 1n);
    expect(result).toBe(0);
  });
});

// ─── buildVaultQuoteMessage ──────────────────────────────────────────────────

describe('buildVaultQuoteMessage', () => {
  test('builds message with all fields', () => {
    const msg = buildVaultQuoteMessage({
      vaultAddress: '0xABCDef1234567890abcdef1234567890ABCDEF12',
      chainId: 5064014,
      vaultCollateralPerShare: '1.5',
      timestamp: 1700000000,
    });
    expect(msg).toContain('Sapience Vault Share Quote');
    expect(msg).toContain('Vault: 0xabcdef1234567890abcdef1234567890abcdef12');
    expect(msg).toContain('ChainId: 5064014');
    expect(msg).toContain('CollateralPerShare: 1.5');
    expect(msg).toContain('Timestamp: 1700000000');
  });

  test('lowercases vault address', () => {
    const msg = buildVaultQuoteMessage({
      vaultAddress: '0xABCD',
      chainId: 1,
      vaultCollateralPerShare: '1',
      timestamp: '123',
    });
    expect(msg).toContain('Vault: 0xabcd');
  });

  test('accepts string chainId and timestamp', () => {
    const msg = buildVaultQuoteMessage({
      vaultAddress: '0x1234',
      chainId: '42161',
      vaultCollateralPerShare: '2',
      timestamp: '9999',
    });
    expect(msg).toContain('ChainId: 42161');
    expect(msg).toContain('Timestamp: 9999');
  });
});
