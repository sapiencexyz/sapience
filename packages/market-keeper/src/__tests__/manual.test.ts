import { describe, it, expect } from 'vitest';
import { decodeFunctionData, type Hex } from 'viem';
import {
  determineOutcomeFromPolymarket,
  buildSettleCalldata,
  buildBatchSettleCalldata,
  outcomeToString,
  manualConditionResolverAbi,
} from '../manual';

// ============ determineOutcomeFromPolymarket ============

describe('determineOutcomeFromPolymarket', () => {
  it('returns YES for [1, 0] payouts', () => {
    const result = determineOutcomeFromPolymarket([1n, 0n]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 0n });
  });

  it('returns NO for [0, 1] payouts', () => {
    const result = determineOutcomeFromPolymarket([0n, 1n]);
    expect(result).toEqual({ yesWeight: 0n, noWeight: 1n });
  });

  it('returns TIE for [1, 1] payouts (voided market)', () => {
    const result = determineOutcomeFromPolymarket([1n, 1n]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 1n });
  });

  it('returns TIE for [0, 0] payouts', () => {
    const result = determineOutcomeFromPolymarket([0n, 0n]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 1n });
  });

  it('handles larger payout values correctly', () => {
    // YES wins with larger values
    const result = determineOutcomeFromPolymarket([
      1000000000000000000n,
      0n,
    ]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 0n });
  });

  it('throws for fewer than 2 payout numerators', () => {
    expect(() => determineOutcomeFromPolymarket([1n])).toThrow(
      'Expected at least 2 payout numerators'
    );
  });

  it('throws for empty payout numerators', () => {
    expect(() => determineOutcomeFromPolymarket([])).toThrow(
      'Expected at least 2 payout numerators'
    );
  });
});

// ============ outcomeToString ============

describe('outcomeToString', () => {
  it('returns YES', () => {
    expect(outcomeToString({ yesWeight: 1n, noWeight: 0n })).toBe('YES');
  });

  it('returns NO', () => {
    expect(outcomeToString({ yesWeight: 0n, noWeight: 1n })).toBe('NO');
  });

  it('returns TIE', () => {
    expect(outcomeToString({ yesWeight: 1n, noWeight: 1n })).toBe('TIE');
  });

  it('returns INVALID for {0, 0}', () => {
    expect(outcomeToString({ yesWeight: 0n, noWeight: 0n })).toBe('INVALID');
  });
});

// ============ buildSettleCalldata ============

describe('buildSettleCalldata', () => {
  const conditionId =
    '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

  it('encodes settleCondition calldata', () => {
    const calldata = buildSettleCalldata(conditionId, {
      yesWeight: 1n,
      noWeight: 0n,
    });

    // Should be a valid hex string starting with the function selector
    expect(calldata).toMatch(/^0x[a-f0-9]+$/);

    // Decode and verify
    const decoded = decodeFunctionData({
      abi: manualConditionResolverAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe('settleCondition');
    expect(decoded.args[0]).toBe(conditionId);
    expect(decoded.args[1]).toEqual({
      yesWeight: 1n,
      noWeight: 0n,
    });
  });

  it('encodes NO outcome correctly', () => {
    const calldata = buildSettleCalldata(conditionId, {
      yesWeight: 0n,
      noWeight: 1n,
    });

    const decoded = decodeFunctionData({
      abi: manualConditionResolverAbi,
      data: calldata,
    });

    expect(decoded.args[1]).toEqual({
      yesWeight: 0n,
      noWeight: 1n,
    });
  });
});

// ============ buildBatchSettleCalldata ============

describe('buildBatchSettleCalldata', () => {
  const ids = [
    '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
    '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
  ];
  const outcomes = [
    { yesWeight: 1n, noWeight: 0n },
    { yesWeight: 0n, noWeight: 1n },
  ];

  it('encodes settleConditions calldata', () => {
    const calldata = buildBatchSettleCalldata(ids, outcomes);

    expect(calldata).toMatch(/^0x[a-f0-9]+$/);

    const decoded = decodeFunctionData({
      abi: manualConditionResolverAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe('settleConditions');
    expect(decoded.args[0]).toEqual(ids);
    expect(decoded.args[1]).toEqual(outcomes);
  });

  it('throws on mismatched array lengths', () => {
    expect(() => buildBatchSettleCalldata(ids, [outcomes[0]])).toThrow(
      'Array length mismatch'
    );
  });
});
