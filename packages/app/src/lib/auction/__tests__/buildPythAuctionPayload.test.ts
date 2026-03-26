import { describe, it, expect } from 'vitest';
import {
  normalizePythPriceId,
  decimalToScaledBigInt,
  parseDateTimeLocalToUnixSeconds,
  pow10,
  normalizePythOutcomes,
  buildPythAuctionStartPayload,
  type PythOutcomeInputStub,
} from '../buildAuctionPayload';
import { pythConditionResolver } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

describe('normalizePythPriceId', () => {
  const BYTES32_ONE =
    '0x0000000000000000000000000000000000000000000000000000000000000001';
  const BYTES32_TWO =
    '0x0000000000000000000000000000000000000000000000000000000000000002';

  it('converts base-10 "1" to padded bytes32', () => {
    expect(normalizePythPriceId('1')).toBe(BYTES32_ONE);
  });

  it('converts base-10 max uint32 (4294967295)', () => {
    const result = normalizePythPriceId('4294967295');
    expect(result).toBe(
      '0x00000000000000000000000000000000000000000000000000000000ffffffff'
    );
  });

  it('throws for base-10 exceeding uint32 (4294967296)', () => {
    expect(() => normalizePythPriceId('4294967296')).toThrow(
      'pyth_feed_id_must_be_uint32'
    );
  });

  it('pads short hex "0x1" to bytes32', () => {
    expect(normalizePythPriceId('0x1')).toBe(BYTES32_ONE);
  });

  it('pads short hex "0xdeadbeef" to bytes32', () => {
    const result = normalizePythPriceId('0xdeadbeef');
    expect(result).toBe(
      '0x00000000000000000000000000000000000000000000000000000000deadbeef'
    );
  });

  it('accepts bytes32 fitting uint32 with high bits zero', () => {
    expect(normalizePythPriceId(BYTES32_TWO)).toBe(BYTES32_TWO);
  });

  it('throws for Hermes-style bytes32 with high bits set', () => {
    const hermesId =
      '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    expect(() => normalizePythPriceId(hermesId)).toThrow(
      'pyth_lazer_feed_id_required_not_hermes_price_id'
    );
  });

  it('throws for empty string', () => {
    expect(() => normalizePythPriceId('')).toThrow('invalid_price_id');
  });

  it('throws for invalid hex length (9-63 chars)', () => {
    // 9 hex chars after 0x prefix
    expect(() => normalizePythPriceId('0x123456789')).toThrow(
      'invalid_price_id_length'
    );
  });
});

describe('decimalToScaledBigInt', () => {
  it('scales integer "50000" by 10^8', () => {
    expect(decimalToScaledBigInt('50000', 8)).toBe(5000000000000n);
  });

  it('scales "0.002" by 10^6', () => {
    expect(decimalToScaledBigInt('0.002', 6)).toBe(2000n);
  });

  it('scales "123.456" by 10^3', () => {
    expect(decimalToScaledBigInt('123.456', 3)).toBe(123456n);
  });

  it('rounds half up: "100.5" with scale 0', () => {
    expect(decimalToScaledBigInt('100.5', 0)).toBe(101n);
  });

  it('throws for empty string', () => {
    expect(() => decimalToScaledBigInt('', 8)).toThrow('invalid_decimal');
  });

  it('throws for negative value', () => {
    expect(() => decimalToScaledBigInt('-5', 8)).toThrow(
      'negative_decimal_not_supported'
    );
  });
});

describe('parseDateTimeLocalToUnixSeconds', () => {
  it('parses valid datetime string', () => {
    const result = parseDateTimeLocalToUnixSeconds('2024-01-15T10:30');
    // Should be a bigint representing seconds
    expect(typeof result).toBe('bigint');
    expect(result).toBeGreaterThan(0n);
    // Verify round-trip via Date
    const d = new Date(2024, 0, 15, 10, 30);
    expect(result).toBe(BigInt(Math.floor(d.getTime() / 1000)));
  });

  it('throws for invalid format', () => {
    expect(() => parseDateTimeLocalToUnixSeconds('not-a-date')).toThrow(
      'invalid_datetime_local'
    );
  });

  it('handles midnight edge case', () => {
    const result = parseDateTimeLocalToUnixSeconds('2024-01-01T00:00');
    const d = new Date(2024, 0, 1, 0, 0);
    expect(result).toBe(BigInt(Math.floor(d.getTime() / 1000)));
  });
});

describe('pow10', () => {
  it('returns 1n for exponent 0', () => {
    expect(pow10(0)).toBe(1n);
  });

  it('returns 100000000n for exponent 8', () => {
    expect(pow10(8)).toBe(100000000n);
  });

  it('throws for negative exponent', () => {
    expect(() => pow10(-1)).toThrow('pow10_negative');
  });
});

const makeStub = (
  overrides: Partial<PythOutcomeInputStub> = {}
): PythOutcomeInputStub => ({
  priceId: '2',
  direction: 'over',
  targetPrice: 50000,
  priceExpo: -8,
  dateTimeLocal: '2024-06-01T12:00',
  ...overrides,
});

describe('normalizePythOutcomes', () => {
  it('normalizes a single outcome with correct fields', () => {
    const [result] = normalizePythOutcomes([makeStub()]);
    expect(result.priceId).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000002'
    );
    expect(result.prediction).toBe(true);
    expect(result.overWinsOnTie).toBe(true);
    expect(result.strikeExpo).toBe(-8);
    expect(result.endTime).toBeGreaterThan(0n);
  });

  it('maps direction "under" to prediction false', () => {
    const [result] = normalizePythOutcomes([makeStub({ direction: 'under' })]);
    expect(result.prediction).toBe(false);
  });

  it('uses targetPriceRaw when provided', () => {
    const [result] = normalizePythOutcomes([
      makeStub({ targetPriceRaw: '50000.12345678', priceExpo: -8 }),
    ]);
    expect(result.strikePrice).toBe(5000012345678n);
  });

  it('defaults overWinsOnTie to true when undefined', () => {
    const [result] = normalizePythOutcomes([
      makeStub({ overWinsOnTie: undefined }),
    ]);
    expect(result.overWinsOnTie).toBe(true);
  });

  it('respects overWinsOnTie = false', () => {
    const [result] = normalizePythOutcomes([
      makeStub({ overWinsOnTie: false }),
    ]);
    expect(result.overWinsOnTie).toBe(false);
  });
});

describe('buildPythAuctionStartPayload', () => {
  it('returns correct resolver address for default chain', () => {
    const result = buildPythAuctionStartPayload([makeStub()]);
    const expectedResolver = pythConditionResolver[DEFAULT_CHAIN_ID]?.address;
    expect(result.resolver.toLowerCase()).toBe(expectedResolver!.toLowerCase());
  });

  it('returns escrowPicks with correct conditionResolver', () => {
    const result = buildPythAuctionStartPayload([makeStub()]);
    const expectedCondResolver =
      pythConditionResolver[DEFAULT_CHAIN_ID]?.address;
    expect(result.escrowPicks).toHaveLength(1);
    expect(result.escrowPicks[0].conditionResolver).toBe(expectedCondResolver);
  });

  it('sets predictedOutcome 0 (YES) for direction "over"', () => {
    const result = buildPythAuctionStartPayload([
      makeStub({ direction: 'over' }),
    ]);
    expect(result.escrowPicks[0].predictedOutcome).toBe(0);
  });

  it('sets predictedOutcome 1 (NO) for direction "under"', () => {
    const result = buildPythAuctionStartPayload([
      makeStub({ direction: 'under' }),
    ]);
    expect(result.escrowPicks[0].predictedOutcome).toBe(1);
  });

  it('returns encoded predictedOutcomes as hex array', () => {
    const result = buildPythAuctionStartPayload([makeStub()]);
    expect(result.predictedOutcomes).toHaveLength(1);
    expect(result.predictedOutcomes[0]).toMatch(/^0x/);
  });

  it('multi-outcome: Over + Under produce correct predictedOutcomes', () => {
    const result = buildPythAuctionStartPayload([
      makeStub({ direction: 'over' }),
      makeStub({ direction: 'under', priceId: '1' }),
    ]);
    expect(result.escrowPicks).toHaveLength(2);
    expect(result.escrowPicks[0].predictedOutcome).toBe(0); // Over = YES
    expect(result.escrowPicks[1].predictedOutcome).toBe(1); // Under = NO
  });

  it('each escrowPick has a unique conditionId', () => {
    const result = buildPythAuctionStartPayload([
      makeStub({ direction: 'over' }),
      makeStub({ direction: 'under', priceId: '1' }),
    ]);
    const ids = result.escrowPicks.map((p) => p.conditionId);
    expect(new Set(ids).size).toBe(2);
  });
});
