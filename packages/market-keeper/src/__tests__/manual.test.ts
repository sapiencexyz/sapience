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

  it('throws for [0, 0] payouts (invalid data)', () => {
    expect(() => determineOutcomeFromPolymarket([0n, 0n])).toThrow(
      'All-zero payout numerators are invalid'
    );
  });

  it('throws for all-zero with extra outcomes', () => {
    expect(() => determineOutcomeFromPolymarket([0n, 0n, 0n])).toThrow(
      'All-zero payout numerators are invalid'
    );
  });

  it('handles larger payout values — YES wins', () => {
    const result = determineOutcomeFromPolymarket([
      1000000000000000000n,
      0n,
    ]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 0n });
  });

  it('handles larger payout values — NO wins', () => {
    const result = determineOutcomeFromPolymarket([
      0n,
      1000000000000000000n,
    ]);
    expect(result).toEqual({ yesWeight: 0n, noWeight: 1n });
  });

  it('handles larger payout values — NO wins by margin', () => {
    const result = determineOutcomeFromPolymarket([
      500000000000000000n,
      1000000000000000000n,
    ]);
    expect(result).toEqual({ yesWeight: 0n, noWeight: 1n });
  });

  it('handles more than 2 outcomes — first wins', () => {
    const result = determineOutcomeFromPolymarket([100n, 0n, 0n]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 0n });
  });

  it('handles more than 2 outcomes — second wins', () => {
    const result = determineOutcomeFromPolymarket([0n, 100n, 50n]);
    expect(result).toEqual({ yesWeight: 0n, noWeight: 1n });
  });

  it('handles more than 2 outcomes — tie when equal', () => {
    const result = determineOutcomeFromPolymarket([50n, 50n, 50n]);
    expect(result).toEqual({ yesWeight: 1n, noWeight: 1n });
  });

  it('ignores extra outcomes beyond first two', () => {
    // Only [yes, no] matter — extra slots are ignored
    const result = determineOutcomeFromPolymarket([0n, 1n, 999n, 999n]);
    expect(result).toEqual({ yesWeight: 0n, noWeight: 1n });
  });

  it('throws for negative payout numerators', () => {
    expect(() => determineOutcomeFromPolymarket([-1n, 0n])).toThrow(
      'Negative payout numerators are invalid'
    );
  });

  it('throws for negative value in second position', () => {
    expect(() => determineOutcomeFromPolymarket([1n, -1n])).toThrow(
      'Negative payout numerators are invalid'
    );
  });

  it('throws for negative values in extra outcomes', () => {
    expect(() => determineOutcomeFromPolymarket([1n, 0n, -5n])).toThrow(
      'Negative payout numerators are invalid'
    );
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

  it('encodes TIE outcome correctly', () => {
    const calldata = buildSettleCalldata(conditionId, {
      yesWeight: 1n,
      noWeight: 1n,
    });

    const decoded = decodeFunctionData({
      abi: manualConditionResolverAbi,
      data: calldata,
    });

    expect(decoded.args[0]).toBe(conditionId);
    expect(decoded.args[1]).toEqual({
      yesWeight: 1n,
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

  it('encodes 5 conditions in a single batch', () => {
    const batchIds = Array.from({ length: 5 }, (_, i) =>
      (`0x${(i + 1).toString(16).padStart(64, '0')}`) as Hex
    );
    const batchOutcomes = [
      { yesWeight: 1n, noWeight: 0n },
      { yesWeight: 0n, noWeight: 1n },
      { yesWeight: 1n, noWeight: 1n },
      { yesWeight: 1n, noWeight: 0n },
      { yesWeight: 0n, noWeight: 1n },
    ];

    const calldata = buildBatchSettleCalldata(batchIds, batchOutcomes);

    const decoded = decodeFunctionData({
      abi: manualConditionResolverAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe('settleConditions');
    expect(decoded.args[0]).toHaveLength(5);
    expect(decoded.args[1]).toHaveLength(5);
    const outcomes = decoded.args[1] as readonly { yesWeight: bigint; noWeight: bigint }[];
    expect(outcomes[0]).toEqual({ yesWeight: 1n, noWeight: 0n });
    expect(outcomes[1]).toEqual({ yesWeight: 0n, noWeight: 1n });
    expect(outcomes[2]).toEqual({ yesWeight: 1n, noWeight: 1n });
    expect(outcomes[3]).toEqual({ yesWeight: 1n, noWeight: 0n });
    expect(outcomes[4]).toEqual({ yesWeight: 0n, noWeight: 1n });
  });
});
