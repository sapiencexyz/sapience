import { describe, it, expect } from 'vitest';
import {
  decodeAuctionPredictedOutcomes,
  decodedOutcomesToPicks,
  formatPythPriceDecimalFromInt,
  formatUnixSecondsToLocalInput,
} from '../decodePredictedOutcomes';
import type { DecodedOutcomes } from '../decodePredictedOutcomes';
import {
  encodePythBinaryOptionOutcomes,
  encodePolymarketPredictedOutcomes,
  getPythMarketId,
  type PythBinaryOptionOutcome,
} from '@sapience/sdk';
import {
  pythConditionResolver,
  manualConditionResolver,
} from '@sapience/sdk/contracts';
import { OutcomeSide } from '@sapience/sdk/types';
import { parseDateTimeLocalToUnixSeconds } from '../buildAuctionPayload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Grab a known pyth resolver address for use in tests
const PYTH_RESOLVER_ADDR = pythConditionResolver[13374202]?.address;
const MANUAL_RESOLVER_ADDR = manualConditionResolver[13374202]?.address;

const ETH_PRICE_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002' as const;

const STRIKE_PRICE = 250000n;
const STRIKE_EXPO = -2;
const END_TIME = 1710428400n;

function makePythOutcomes(
  overrides?: Partial<{
    priceId: `0x${string}`;
    endTime: bigint;
    strikePrice: bigint;
    strikeExpo: number;
    overWinsOnTie: boolean;
    prediction: boolean;
  }>[]
): DecodedOutcomes {
  const defaults = {
    priceId: ETH_PRICE_ID,
    endTime: END_TIME,
    strikePrice: STRIKE_PRICE,
    strikeExpo: STRIKE_EXPO,
    overWinsOnTie: true,
    prediction: true,
  };
  return {
    kind: 'pyth',
    outcomes: (overrides ?? [{}]).map((o) => ({
      kind: 'pyth' as const,
      ...defaults,
      ...o,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests — decodeAuctionPredictedOutcomes
// ---------------------------------------------------------------------------

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
      resolver: MANUAL_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });

    expect(result.kind).toBe('condition');
    if (result.kind === 'condition') {
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

    expect(result.kind).toBe('condition');
    if (result.kind === 'condition') {
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

// ---------------------------------------------------------------------------
// Tests — decodedOutcomesToPicks
// ---------------------------------------------------------------------------

describe('decodedOutcomesToPicks — Pyth outcomes', () => {
  it('returns Pick[] with conditionResolver = pythConditionResolver address', () => {
    const picks = decodedOutcomesToPicks(
      makePythOutcomes(),
      PYTH_RESOLVER_ADDR!
    );

    expect(picks).toHaveLength(1);
    expect(picks[0].conditionResolver).toBe(PYTH_RESOLVER_ADDR);
  });

  it('conditionId = getPythMarketId(outcome)', () => {
    const decoded = makePythOutcomes();
    const picks = decodedOutcomesToPicks(decoded, PYTH_RESOLVER_ADDR!);

    const expectedConditionId = getPythMarketId({
      priceId: ETH_PRICE_ID,
      endTime: END_TIME,
      strikePrice: STRIKE_PRICE,
      strikeExpo: STRIKE_EXPO,
      overWinsOnTie: true,
    });

    expect(picks[0].conditionId).toBe(expectedConditionId);
  });

  it('predictedOutcome matches on-chain convention: prediction:true (Over) → 0 (YES), prediction:false (Under) → 1 (NO)', () => {
    const overPicks = decodedOutcomesToPicks(
      makePythOutcomes([{ prediction: true }]),
      PYTH_RESOLVER_ADDR!
    );
    expect(overPicks[0].predictedOutcome).toBe(0);

    const underPicks = decodedOutcomesToPicks(
      makePythOutcomes([{ prediction: false }]),
      PYTH_RESOLVER_ADDR!
    );
    expect(underPicks[0].predictedOutcome).toBe(1);
  });

  it('multi-outcome Pyth picks produce correct array', () => {
    const decoded = makePythOutcomes([
      { prediction: true, priceId: ETH_PRICE_ID },
      { prediction: false, strikePrice: 100000n },
    ]);

    const picks = decodedOutcomesToPicks(decoded, PYTH_RESOLVER_ADDR!);
    expect(picks).toHaveLength(2);
    expect(picks[0].predictedOutcome).toBe(0);
    expect(picks[1].predictedOutcome).toBe(1);
  });

  it('returns empty array for unknown decoded outcomes', () => {
    const decoded: DecodedOutcomes = { kind: 'unknown', outcomes: [] };
    const picks = decodedOutcomesToPicks(decoded, PYTH_RESOLVER_ADDR!);
    expect(picks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests — decodedOutcomesToPicks: condition outcomes
// ---------------------------------------------------------------------------

describe('decodedOutcomesToPicks — condition outcomes', () => {
  it('maps prediction:true to OutcomeSide.YES and prediction:false to OutcomeSide.NO', () => {
    const decoded: DecodedOutcomes = {
      kind: 'condition',
      outcomes: [
        {
          kind: 'condition',
          marketId: '0xaa' as `0x${string}`,
          prediction: true,
        },
        {
          kind: 'condition',
          marketId: '0xbb' as `0x${string}`,
          prediction: false,
        },
      ],
    };
    const picks = decodedOutcomesToPicks(decoded, MANUAL_RESOLVER_ADDR!);
    expect(picks[0].predictedOutcome).toBe(OutcomeSide.YES);
    expect(picks[1].predictedOutcome).toBe(OutcomeSide.NO);
  });

  it('uses provided resolver address for all picks', () => {
    const decoded: DecodedOutcomes = {
      kind: 'condition',
      outcomes: [
        {
          kind: 'condition',
          marketId: '0xcc' as `0x${string}`,
          prediction: true,
        },
      ],
    };
    const picks = decodedOutcomesToPicks(decoded, MANUAL_RESOLVER_ADDR!);
    expect(picks[0].conditionResolver).toBe(MANUAL_RESOLVER_ADDR);
    expect(picks[0].conditionId).toBe('0xcc');
  });
});

// ---------------------------------------------------------------------------
// Tests — on-chain invariant: encode → decode → picks round-trip
//
// PythConditionResolver.getResolution():
//   resolvedToOver=true  → OutcomeVector(1, 0) → YES wins
//   resolvedToOver=false → OutcomeVector(0, 1) → NO wins
//
// PredictionMarketEscrow._evaluatePick():
//   predictedOutcome==YES && isDecisiveYes → win
//   predictedOutcome==NO  && isDecisiveNo  → win
//
// This test verifies encode → decode → picks produces predictedOutcome
// values that are consistent with the on-chain resolution convention.
// ---------------------------------------------------------------------------

describe('on-chain invariant: Pyth encode → decode → picks', () => {
  it('Over prediction encodes to YES=0, which wins when resolvedToOver=true', () => {
    // Encode
    const outcomes: PythBinaryOptionOutcome[] = [
      {
        priceId: ETH_PRICE_ID,
        endTime: END_TIME,
        strikePrice: STRIKE_PRICE,
        strikeExpo: STRIKE_EXPO,
        overWinsOnTie: true,
        prediction: true, // Over
      },
    ];
    const encoded = encodePythBinaryOptionOutcomes(outcomes);

    // Decode
    const decoded = decodeAuctionPredictedOutcomes({
      resolver: PYTH_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });
    expect(decoded.kind).toBe('pyth');

    // To picks
    const picks = decodedOutcomesToPicks(decoded, PYTH_RESOLVER_ADDR!);
    expect(picks).toHaveLength(1);

    // Over → YES=0: on-chain, when resolvedToOver=true the OutcomeVector
    // is [1,0] (isDecisiveYes), so predictedOutcome must be YES=0 to win.
    expect(picks[0].predictedOutcome).toBe(OutcomeSide.YES);
  });

  it('Under prediction encodes to NO=1, which wins when resolvedToOver=false', () => {
    const outcomes: PythBinaryOptionOutcome[] = [
      {
        priceId: ETH_PRICE_ID,
        endTime: END_TIME,
        strikePrice: STRIKE_PRICE,
        strikeExpo: STRIKE_EXPO,
        overWinsOnTie: true,
        prediction: false, // Under
      },
    ];
    const encoded = encodePythBinaryOptionOutcomes(outcomes);

    const decoded = decodeAuctionPredictedOutcomes({
      resolver: PYTH_RESOLVER_ADDR,
      predictedOutcomes: [encoded],
    });
    const picks = decodedOutcomesToPicks(decoded, PYTH_RESOLVER_ADDR!);

    // Under → NO=1: on-chain, when resolvedToOver=false the OutcomeVector
    // is [0,1] (isDecisiveNo), so predictedOutcome must be NO=1 to win.
    expect(picks[0].predictedOutcome).toBe(OutcomeSide.NO);
  });
});

// ---------------------------------------------------------------------------
// Tests — formatPythPriceDecimalFromInt
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests — formatUnixSecondsToLocalInput
// ---------------------------------------------------------------------------

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
