/**
 * Tests for simulation utility functions.
 *
 * Covers mergeStateOverrides and isContractRevert — pure utility functions
 * that are being moved from the app to the SDK.
 */

import { describe, test, expect } from 'vitest';
import {
  mergeStateOverrides,
  isContractRevert,
  parseSimulationError,
  buildSimulationStateOverride,
  getSoladyBalanceSlot,
  getSoladyAllowanceSlot,
} from '../simulate';

// ─── mergeStateOverrides ──────────────────────────────────────────────────────

describe('mergeStateOverrides', () => {
  test('two overrides for different addresses → concatenated', () => {
    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];
    const b = [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`,
        balance: 200n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(2);
    expect(result[0].address).toBe(
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(result[1].address).toBe(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    );
  });

  test('two overrides for same address → stateDiff merged, higher balance kept', () => {
    const slot1 =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
    const slot2 =
      '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`;
    const val =
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as `0x${string}`;

    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
        stateDiff: [{ slot: slot1, value: val }],
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 200n,
        stateDiff: [{ slot: slot2, value: val }],
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(200n);
    expect(result[0].stateDiff).toHaveLength(2);
  });

  test('case-insensitive address matching', () => {
    const a = [
      {
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`,
        balance: 100n,
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 50n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(100n);
  });

  test('empty inputs → empty output', () => {
    expect(mergeStateOverrides([], [])).toEqual([]);
  });

  test('one empty, one non-empty', () => {
    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];
    expect(mergeStateOverrides(a, [])).toHaveLength(1);
    expect(mergeStateOverrides([], a)).toHaveLength(1);
  });

  test('merge with only stateDiff (no balance)', () => {
    const slot =
      '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
    const val =
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as `0x${string}`;

    const a = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        stateDiff: [{ slot, value: val }],
      },
    ];
    const b = [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
        balance: 100n,
      },
    ];

    const result = mergeStateOverrides(a, b);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(100n);
    expect(result[0].stateDiff).toHaveLength(1);
  });
});

// ─── isContractRevert ─────────────────────────────────────────────────────────

describe('isContractRevert', () => {
  test('ContractFunctionExecutionError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionExecutionError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('ContractFunctionRevertedError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionRevertedError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('ContractFunctionZeroDataError → true', () => {
    const err = new Error('some message');
    err.name = 'ContractFunctionZeroDataError';
    expect(isContractRevert(err)).toBe(true);
  });

  test('message with "execution reverted" → true', () => {
    const err = new Error('The contract execution reverted');
    expect(isContractRevert(err)).toBe(true);
  });

  test('message with "revert" → true', () => {
    const err = new Error('Transaction revert');
    expect(isContractRevert(err)).toBe(true);
  });

  test('network timeout error → false', () => {
    const err = new Error('network timeout');
    expect(isContractRevert(err)).toBe(false);
  });

  test('generic error → false', () => {
    const err = new Error('something went wrong');
    expect(isContractRevert(err)).toBe(false);
  });

  test('non-Error value → false', () => {
    expect(isContractRevert('string error')).toBe(false);
    expect(isContractRevert(null)).toBe(false);
    expect(isContractRevert(undefined)).toBe(false);
    expect(isContractRevert(42)).toBe(false);
  });
});

// ─── parseSimulationError ─────────────────────────────────────────────────────

describe('parseSimulationError', () => {
  test('InvalidSignature → human-readable', () => {
    const err = new Error('InvalidSignature()');
    expect(parseSimulationError(err)).toBe('Invalid signature');
  });

  test('SafeERC20FailedOperation → human-readable', () => {
    const err = new Error('SafeERC20FailedOperation');
    expect(parseSimulationError(err)).toBe(
      'Bidder has insufficient funds or allowance'
    );
  });

  test('non-Error → fallback', () => {
    expect(parseSimulationError('just a string')).toBe('Simulation failed');
  });

  test('long message → truncated', () => {
    const err = new Error('x'.repeat(500));
    const result = parseSimulationError(err);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  test('revert with selector → extracts selector', () => {
    const err = new Error('execution reverted with data 0xdeadbeef');
    expect(parseSimulationError(err)).toContain('0xdeadbeef');
  });
});

// ─── buildSimulationStateOverride ─────────────────────────────────────────────

describe('buildSimulationStateOverride', () => {
  test('returns override entries for simulationAddress and collateralToken', () => {
    const addr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const collateral =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const market =
      '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;

    const result = buildSimulationStateOverride({
      simulationAddress: addr,
      collateralTokenAddress: collateral,
      predictionMarketAddress: market,
      counterpartyCollateralWei: 1000n,
    });

    expect(result).toHaveLength(2);
    expect(result[0].address).toBe(addr);
    expect(result[0].balance).toBe(10n ** 18n);
    expect(result[1].address).toBe(collateral);
    expect(result[1].stateDiff).toHaveLength(2);
  });
});

// ─── Solady slot helpers ──────────────────────────────────────────────────────

describe('getSoladyBalanceSlot', () => {
  test('produces deterministic output', () => {
    const addr = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const slot1 = getSoladyBalanceSlot(addr);
    const slot2 = getSoladyBalanceSlot(addr);
    expect(slot1).toBe(slot2);
    expect(slot1.startsWith('0x')).toBe(true);
    expect(slot1.length).toBe(66); // 0x + 64 hex chars
  });
});

describe('getSoladyAllowanceSlot', () => {
  test('produces deterministic output', () => {
    const owner = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const spender =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const slot1 = getSoladyAllowanceSlot(owner, spender);
    const slot2 = getSoladyAllowanceSlot(owner, spender);
    expect(slot1).toBe(slot2);
  });

  test('different spenders produce different slots', () => {
    const owner = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
    const spender1 =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;
    const spender2 =
      '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`;
    expect(getSoladyAllowanceSlot(owner, spender1)).not.toBe(
      getSoladyAllowanceSlot(owner, spender2)
    );
  });
});
