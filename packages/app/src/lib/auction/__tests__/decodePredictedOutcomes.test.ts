import { describe, it, expect } from 'vitest';
import {
  decodeAuctionPredictedOutcomes,
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '../decodePredictedOutcomes';
import {
  encodePythBinaryOptionOutcomes,
  encodePolymarketPredictedOutcomes,
  type PythBinaryOptionOutcome,
} from '@sapience/sdk';
import { pythResolver, umaResolver } from '@sapience/sdk/contracts';
import { parseDateTimeLocalToUnixSeconds } from '../buildAuctionPayload';

// Grab a known pyth resolver address for use in tests
const PYTH_RESOLVER_ADDR = pythResolver[5064014]?.address;
const UMA_RESOLVER_ADDR = umaResolver[42161]?.address;

describe('decodeAuctionPredictedOutcomes', () => {
  it('decodes Pyth resolver + valid ABI-encoded data', () => {
    const outcomes: PythBinaryOptionOutcome[] = [
      {
        priceId:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        endTime: 1700000000n,
        strikePrice: 5000000000000n,
        strikeExpo: -8,
        overWinsOnTie: true,
        prediction: true,
      },
    ];
    const encoded = encodePythBinaryOptionOutcomes(outcomes);

    const result = decodeAuctionPredictedOutcomes({
      resolver: PYTH_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });

    expect(result.kind).toBe('pyth');
    if (result.kind === 'pyth') {
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0].priceId).toBe(outcomes[0].priceId);
      expect(result.outcomes[0].endTime).toBe(1700000000n);
      expect(result.outcomes[0].strikePrice).toBe(5000000000000n);
      expect(result.outcomes[0].strikeExpo).toBe(-8);
      expect(result.outcomes[0].overWinsOnTie).toBe(true);
      expect(result.outcomes[0].prediction).toBe(true);
    }
  });

  it('round-trips: encode then decode Pyth outcomes', () => {
    const original: PythBinaryOptionOutcome[] = [
      {
        priceId:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        endTime: 1800000000n,
        strikePrice: 100000n,
        strikeExpo: -2,
        overWinsOnTie: false,
        prediction: false,
      },
    ];
    const encoded = encodePythBinaryOptionOutcomes(original);
    const decoded = decodeAuctionPredictedOutcomes({
      resolver: PYTH_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });

    expect(decoded.kind).toBe('pyth');
    if (decoded.kind === 'pyth') {
      expect(decoded.outcomes[0].priceId).toBe(original[0].priceId);
      expect(decoded.outcomes[0].endTime).toBe(original[0].endTime);
      expect(decoded.outcomes[0].strikePrice).toBe(original[0].strikePrice);
      expect(decoded.outcomes[0].strikeExpo).toBe(original[0].strikeExpo);
      expect(decoded.outcomes[0].overWinsOnTie).toBe(false);
      expect(decoded.outcomes[0].prediction).toBe(false);
    }
  });

  it('decodes UMA resolver + valid data', () => {
    const encoded = encodePolymarketPredictedOutcomes([
      {
        marketId:
          '0x00000000000000000000000000000000000000000000000000000000000000aa',
        prediction: true,
      },
    ]);

    const result = decodeAuctionPredictedOutcomes({
      resolver: UMA_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });

    expect(result.kind).toBe('uma');
    if (result.kind === 'uma') {
      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0].prediction).toBe(true);
    }
  });

  it('defaults to UMA decoding when resolver is null', () => {
    const encoded = encodePolymarketPredictedOutcomes([
      {
        marketId:
          '0x00000000000000000000000000000000000000000000000000000000000000bb',
        prediction: false,
      },
    ]);

    const result = decodeAuctionPredictedOutcomes({
      resolver: null,
      predictedOutcomes: [encoded],
    });

    expect(result.kind).toBe('uma');
    if (result.kind === 'uma') {
      expect(result.outcomes[0].prediction).toBe(false);
    }
  });

  it('returns unknown for unknown resolver with invalid data', () => {
    const result = decodeAuctionPredictedOutcomes({
      resolver: '0x1234567890123456789012345678901234567890',
      predictedOutcomes: ['0xdeadbeef'],
    });

    expect(result.kind).toBe('unknown');
    expect(result.outcomes).toHaveLength(0);
  });

  it('returns unknown for empty predictedOutcomes', () => {
    const result = decodeAuctionPredictedOutcomes({
      resolver: PYTH_RESOLVER_ADDR,
      predictedOutcomes: [],
    });

    expect(result).toEqual({ kind: 'unknown', outcomes: [] });
  });
});

describe('formatPythPriceDecimalFromInt', () => {
  it('formats 5000000000000n with expo -8 as "50000"', () => {
    expect(formatPythPriceDecimalFromInt(5000000000000n, -8)).toBe('50000');
  });

  it('formats 123456789n with expo -8 as "1.23456789"', () => {
    expect(formatPythPriceDecimalFromInt(123456789n, -8)).toBe('1.23456789');
  });

  it('formats 100n with expo 0 as "100"', () => {
    expect(formatPythPriceDecimalFromInt(100n, 0)).toBe('100');
  });

  it('formats 5n with expo 2 as "500"', () => {
    expect(formatPythPriceDecimalFromInt(5n, 2)).toBe('500');
  });

  it('formats 0n with expo -8 as "0"', () => {
    expect(formatPythPriceDecimalFromInt(0n, -8)).toBe('0');
  });

  it('formats negative -5000000000000n with expo -8 as "-50000"', () => {
    expect(formatPythPriceDecimalFromInt(-5000000000000n, -8)).toBe('-50000');
  });

  it('strips trailing zeros: 1200n with expo -2 as "12"', () => {
    expect(formatPythPriceDecimalFromInt(1200n, -2)).toBe('12');
  });
});

describe('formatUnixSecondsToLocalInput', () => {
  it('returns YYYY-MM-DDTHH:MM format', () => {
    const ts = BigInt(
      Math.floor(new Date(2024, 0, 15, 10, 30).getTime() / 1000)
    );
    const result = formatUnixSecondsToLocalInput(ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(result).toBe('2024-01-15T10:30');
  });

  it('round-trips with parseDateTimeLocalToUnixSeconds', () => {
    const original = '2024-06-15T14:00';
    const unix = parseDateTimeLocalToUnixSeconds(original);
    const roundTripped = formatUnixSecondsToLocalInput(unix);
    expect(roundTripped).toBe(original);
  });
});
