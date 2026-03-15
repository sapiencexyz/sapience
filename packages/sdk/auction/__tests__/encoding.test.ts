import { describe, test, expect } from 'vitest';
import type { Hex } from 'viem';
import {
  encodePolymarketPredictedOutcomes,
  getPythMarketId,
  getPythMarketHash,
  decodePythMarketId,
  encodePythBinaryOptionOutcomes,
  parsePythMarketFromDescription,
  decodePythLazerFeedId,
} from '../encoding';

// ─── encodePolymarketPredictedOutcomes ───────────────────────────────────────

describe('encodePolymarketPredictedOutcomes', () => {
  const marketId =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

  test('encodes single outcome', () => {
    const result = encodePolymarketPredictedOutcomes([
      { marketId, prediction: true },
    ]);
    expect(result).toMatch(/^0x/);
    expect(result.length).toBeGreaterThan(2);
  });

  test('encodes multiple outcomes', () => {
    const result = encodePolymarketPredictedOutcomes([
      { marketId, prediction: true },
      { marketId, prediction: false },
    ]);
    expect(result).toMatch(/^0x/);
  });

  test('empty array encodes without error', () => {
    const result = encodePolymarketPredictedOutcomes([]);
    expect(result).toMatch(/^0x/);
  });
});

// ─── getPythMarketId ─────────────────────────────────────────────────────────

describe('getPythMarketId', () => {
  const market = {
    priceId:
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex,
    endTime: 1700000000n,
    strikePrice: 50000n,
    strikeExpo: -8,
    overWinsOnTie: true,
  };

  test('returns deterministic encoding', () => {
    const id1 = getPythMarketId(market);
    const id2 = getPythMarketId(market);
    expect(id1).toBe(id2);
  });

  test('encodes all 5 params as hex', () => {
    const id = getPythMarketId(market);
    expect(id).toMatch(/^0x/);
    expect(id.length).toBeGreaterThan(2);
  });

  test('different params produce different ids', () => {
    const id1 = getPythMarketId(market);
    const id2 = getPythMarketId({ ...market, strikePrice: 60000n });
    expect(id1).not.toBe(id2);
  });
});

// ─── getPythMarketHash ───────────────────────────────────────────────────────

describe('getPythMarketHash', () => {
  const market = {
    priceId:
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex,
    endTime: 1700000000n,
    strikePrice: 50000n,
    strikeExpo: -8,
    overWinsOnTie: false,
  };

  test('returns a bytes32 hash', () => {
    const hash = getPythMarketHash(market);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test('hash differs from raw market id', () => {
    const id = getPythMarketId(market);
    const hash = getPythMarketHash(market);
    expect(hash).not.toBe(id);
  });

  test('is deterministic', () => {
    expect(getPythMarketHash(market)).toBe(getPythMarketHash(market));
  });
});

// ─── decodePythMarketId ──────────────────────────────────────────────────────

describe('decodePythMarketId', () => {
  const market = {
    priceId:
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex,
    endTime: 1700000000n,
    strikePrice: 50000n,
    strikeExpo: -8,
    overWinsOnTie: true,
  };

  test('round-trip: encode → decode matches original', () => {
    const encoded = getPythMarketId(market);
    const decoded = decodePythMarketId(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.priceId).toBe(market.priceId);
    expect(decoded!.endTime).toBe(market.endTime);
    expect(decoded!.strikePrice).toBe(market.strikePrice);
    expect(decoded!.strikeExpo).toBe(market.strikeExpo);
    expect(decoded!.overWinsOnTie).toBe(market.overWinsOnTie);
  });

  test('returns null for invalid data', () => {
    expect(decodePythMarketId('0xdeadbeef' as Hex)).toBeNull();
  });
});

// ─── encodePythBinaryOptionOutcomes ──────────────────────────────────────────

describe('encodePythBinaryOptionOutcomes', () => {
  const outcome = {
    priceId:
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex,
    endTime: 1700000000n,
    strikePrice: 50000n,
    strikeExpo: -8,
    overWinsOnTie: true,
    prediction: true,
  };

  test('encodes single outcome', () => {
    const result = encodePythBinaryOptionOutcomes([outcome]);
    expect(result).toMatch(/^0x/);
    expect(result.length).toBeGreaterThan(2);
  });

  test('encodes multiple outcomes', () => {
    const result = encodePythBinaryOptionOutcomes([
      outcome,
      { ...outcome, prediction: false },
    ]);
    expect(result).toMatch(/^0x/);
  });

  test('includes prediction boolean in encoding', () => {
    const trueEnc = encodePythBinaryOptionOutcomes([
      { ...outcome, prediction: true },
    ]);
    const falseEnc = encodePythBinaryOptionOutcomes([
      { ...outcome, prediction: false },
    ]);
    expect(trueEnc).not.toBe(falseEnc);
  });
});

// ─── parsePythMarketFromDescription ──────────────────────────────────────────

describe('parsePythMarketFromDescription', () => {
  test('parses valid description', () => {
    const desc =
      'PYTH_LAZER|priceId=0x00ff|endTime=1700000000|strikePrice=50000|strikeExpo=-8|overWinsOnTie=1';
    const result = parsePythMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.priceId).toBe('0x00ff');
    expect(result!.endTime).toBe(1700000000n);
    expect(result!.strikePrice).toBe(50000n);
    expect(result!.strikeExpo).toBe(-8);
    expect(result!.overWinsOnTie).toBe(true);
  });

  test('returns null for non-PYTH_LAZER prefix', () => {
    const desc =
      'OTHER|priceId=0x00ff|endTime=1700000000|strikePrice=50000|strikeExpo=-8';
    expect(parsePythMarketFromDescription(desc)).toBeNull();
  });

  test('returns null for missing fields', () => {
    expect(
      parsePythMarketFromDescription('PYTH_LAZER|priceId=0x00ff')
    ).toBeNull();
  });

  test('handles priceId without 0x prefix', () => {
    const desc =
      'PYTH_LAZER|priceId=00ff|endTime=1700000000|strikePrice=50000|strikeExpo=-8';
    const result = parsePythMarketFromDescription(desc);
    expect(result).not.toBeNull();
    expect(result!.priceId).toBe('0x00ff');
  });

  test('overWinsOnTie "0" is false', () => {
    const desc =
      'PYTH_LAZER|priceId=0x00ff|endTime=1700000000|strikePrice=50000|strikeExpo=-8|overWinsOnTie=0';
    const result = parsePythMarketFromDescription(desc);
    expect(result!.overWinsOnTie).toBe(false);
  });

  test('missing overWinsOnTie defaults to false', () => {
    const desc =
      'PYTH_LAZER|priceId=0x00ff|endTime=1700000000|strikePrice=50000|strikeExpo=-8';
    const result = parsePythMarketFromDescription(desc);
    expect(result!.overWinsOnTie).toBe(false);
  });
});

// ─── decodePythLazerFeedId ───────────────────────────────────────────────────

describe('decodePythLazerFeedId', () => {
  test('decodes valid uint32', () => {
    const id =
      '0x00000000000000000000000000000000000000000000000000000000000000ff' as Hex;
    expect(decodePythLazerFeedId(id)).toBe(255);
  });

  test('returns null for zero', () => {
    const id =
      '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
    expect(decodePythLazerFeedId(id)).toBeNull();
  });

  test('returns null for value exceeding uint32 max', () => {
    // 0x1_0000_0000 = 4294967296 > uint32 max
    const id =
      '0x0000000000000000000000000000000000000000000000000000000100000000' as Hex;
    expect(decodePythLazerFeedId(id)).toBeNull();
  });

  test('decodes max uint32', () => {
    // 0xFFFFFFFF = 4294967295
    const id =
      '0x00000000000000000000000000000000000000000000000000000000ffffffff' as Hex;
    expect(decodePythLazerFeedId(id)).toBe(4294967295);
  });

  test('returns null for invalid hex', () => {
    expect(decodePythLazerFeedId('not-hex' as Hex)).toBeNull();
  });
});
