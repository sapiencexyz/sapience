import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findUnique: vi.fn() },
  attestationScore: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  condition: { findUnique: vi.fn(), findMany: vi.fn() },
  attesterMarketTwError: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../db', () => ({ default: mockPrisma }));
vi.mock('./predictionNormalization', () => ({
  normalizePredictionToProbability: vi.fn().mockReturnValue({
    probabilityFloat: 0.7,
    probabilityD18: '700000000000000000',
  }),
  outcomeFromCondition: vi.fn(),
}));

import {
  upsertAttestationScoreFromAttestation,
  scoreSelectedForecastsForSettledMarket,
  computeTimeWeightedForAttesterMarketValue,
  computeTimeWeightedForAttesterSummary,
  computeTimeWeightedForAttestersSummary,
} from './scoringService';
import { outcomeFromCondition } from './predictionNormalization';

const mockOutcome = outcomeFromCondition as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// upsertAttestationScoreFromAttestation
// ---------------------------------------------------------------------------
describe('upsertAttestationScoreFromAttestation', () => {
  it('does nothing when attestation is not found', async () => {
    mockPrisma.attestation.findUnique.mockResolvedValue(null);
    await upsertAttestationScoreFromAttestation(999);
    expect(mockPrisma.attestationScore.upsert).not.toHaveBeenCalled();
  });

  it('upserts an attestation score with normalized values', async () => {
    mockPrisma.attestation.findUnique.mockResolvedValue({
      id: 1,
      attester: '0xABC',
      conditionId: 'cond-1',
      resolver: '0xResolver',
      prediction: '0.7',
      time: 1000,
      condition: { resolver: '0xMarket' },
    });
    mockPrisma.attestationScore.upsert.mockResolvedValue({});

    await upsertAttestationScoreFromAttestation(1);

    expect(mockPrisma.attestationScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attestationId: 1 },
        create: expect.objectContaining({
          attestationId: 1,
          attester: '0xabc',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          probabilityFloat: 0.7,
          probabilityD18: '700000000000000000',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// scoreSelectedForecastsForSettledMarket
// ---------------------------------------------------------------------------
describe('scoreSelectedForecastsForSettledMarket', () => {
  const MARKET_ADDR = '0xMarket';
  const MARKET_ID = 'cond-1';

  it('returns early when condition is not found', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue(null);
    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);
    expect(mockOutcome).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('clears stale scores when outcome is null (unsettled)', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: false,
      resolvedToYes: false,
    });
    mockOutcome.mockReturnValue(null);
    mockPrisma.attestationScore.updateMany.mockResolvedValue({ count: 2 });

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);

    expect(mockPrisma.attestationScore.updateMany).toHaveBeenCalledWith({
      where: {
        marketAddress: '0xmarket',
        marketId: MARKET_ID,
      },
      data: { errorSquared: null, scoredAt: null, outcome: null },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns early when endTime is null', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: null,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns early when no selected forecasts exist', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('scores perfect prediction (p=1, outcome=1) with errorSquared=0', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 10, probabilityFloat: 1.0 },
    ]);
    mockPrisma.$transaction.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);

    // The function maps over selected rows calling prisma.attestationScore.update,
    // then passes the resulting array to $transaction.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attestationScore.update).toHaveBeenCalledWith({
      where: { attestationId: 10 },
      data: expect.objectContaining({ errorSquared: 0, outcome: 1 }),
    });
  });

  it('scores worst prediction (p=0, outcome=1) with errorSquared=1', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 20, probabilityFloat: 0.0 },
    ]);
    mockPrisma.$transaction.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);

    expect(mockPrisma.attestationScore.update).toHaveBeenCalledWith({
      where: { attestationId: 20 },
      data: expect.objectContaining({ errorSquared: 1, outcome: 1 }),
    });
  });

  it('scores mid prediction (p=0.7, outcome=1) with errorSquared≈0.09', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 30, probabilityFloat: 0.7 },
    ]);
    mockPrisma.$transaction.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);

    const call = mockPrisma.attestationScore.update.mock.calls[0][0];
    expect(call.where.attestationId).toBe(30);
    expect(call.data.errorSquared).toBeCloseTo(0.09, 6);
    expect(call.data.outcome).toBe(1);
  });

  it('scores multiple forecasts in a single $transaction call', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 40, probabilityFloat: 1.0 },
      { attestationId: 41, probabilityFloat: 0.5 },
    ]);
    mockPrisma.$transaction.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket(MARKET_ADDR, MARKET_ID);

    // Both updates dispatched inside a single $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attestationScore.update).toHaveBeenCalledTimes(2);

    // p=1 => err=0
    expect(mockPrisma.attestationScore.update).toHaveBeenCalledWith({
      where: { attestationId: 40 },
      data: expect.objectContaining({ errorSquared: 0 }),
    });
    // p=0.5 => err=0.25
    const secondCall = mockPrisma.attestationScore.update.mock.calls[1][0];
    expect(secondCall.data.errorSquared).toBeCloseTo(0.25, 6);
  });
});

// ---------------------------------------------------------------------------
// computeTimeWeightedForAttesterMarketValue
// ---------------------------------------------------------------------------
describe('computeTimeWeightedForAttesterMarketValue', () => {
  const MARKET_ADDR = '0xMarket';
  const MARKET_ID = 'cond-1';
  const ATTESTER = '0xAttester';

  it('returns null when condition is not found', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue(null);
    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeNull();
  });

  it('returns null when condition has no endTime', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: null,
      settled: true,
      resolvedToYes: true,
    });
    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeNull();
  });

  it('returns null when condition is not settled (outcome is null)', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: false,
      resolvedToYes: false,
    });
    mockOutcome.mockReturnValue(null);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeNull();
  });

  it('returns null when no forecast rows exist', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([]);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeNull();
  });

  it('computes single forecast score = (1 - brierScore) * tau', async () => {
    // p=0.8, outcome=1, madeAt=1000, endTime=2000 => tau=1000
    // brier = (0.8 - 1)^2 = 0.04
    // score = (1 - 0.04) * 1000 = 960
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      {
        attestationId: 1,
        probabilityFloat: 0.8,
        madeAt: 1000,
        attester: ATTESTER,
      },
    ]);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeCloseTo(960, 6);
  });

  it('computes average of multiple forecasts', async () => {
    // Forecast 1: p=0.8, madeAt=1000, end=2000 => tau=1000, brier=0.04, score=960
    // Forecast 2: p=0.6, madeAt=1500, end=2000 => tau=500, brier=0.16, score=420
    // average = (960 + 420) / 2 = 690
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      {
        attestationId: 1,
        probabilityFloat: 0.8,
        madeAt: 1000,
        attester: ATTESTER,
      },
      {
        attestationId: 2,
        probabilityFloat: 0.6,
        madeAt: 1500,
        attester: ATTESTER,
      },
    ]);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeCloseTo(690, 6);
  });

  it('skips forecasts with tau=0 and returns null if all skipped', async () => {
    // Forecast exactly at endTime: madeAt=2000, end=2000 => tau=0, skipped
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      {
        attestationId: 1,
        probabilityFloat: 0.9,
        madeAt: 2000,
        attester: ATTESTER,
      },
    ]);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeNull();
  });

  it('skips tau=0 forecasts but scores remaining ones', async () => {
    // Forecast 1: madeAt=2000, end=2000 => tau=0, skipped
    // Forecast 2: p=1.0, madeAt=1000, end=2000 => tau=1000, brier=0, score=1000
    // average = 1000 / 1 = 1000
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: MARKET_ID,
      endTime: 2000,
      settled: true,
      resolvedToYes: true,
    });
    mockOutcome.mockReturnValue(1);
    mockPrisma.attestationScore.findMany.mockResolvedValue([
      {
        attestationId: 1,
        probabilityFloat: 0.9,
        madeAt: 2000,
        attester: ATTESTER,
      },
      {
        attestationId: 2,
        probabilityFloat: 1.0,
        madeAt: 1000,
        attester: ATTESTER,
      },
    ]);

    const result = await computeTimeWeightedForAttesterMarketValue(
      MARKET_ADDR,
      MARKET_ID,
      ATTESTER
    );
    expect(result).toBeCloseTo(1000, 6);
  });
});

// ---------------------------------------------------------------------------
// computeTimeWeightedForAttesterSummary
// ---------------------------------------------------------------------------
describe('computeTimeWeightedForAttesterSummary', () => {
  const ATTESTER = '0xAttester';

  it('returns {0, 0} when attester has no markets', async () => {
    mockPrisma.attestationScore.findMany.mockResolvedValue([]);

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result).toEqual({ sumTimeWeightedError: 0, numTimeWeighted: 0 });
  });

  it('computes summary for a single market', async () => {
    // Single market: p=0.8, madeAt=1000, end=2000 => tau=1000
    // brier = (0.8-1)^2 = 0.04, score = 0.96 * 1000 = 960
    // sum=960, n=1
    mockPrisma.attestationScore.findMany
      // distinctMarkets query
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      // rows query (all forecasts)
      .mockResolvedValueOnce([
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 1000,
          probabilityFloat: 0.8,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 2000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result.numTimeWeighted).toBe(1);
    expect(result.sumTimeWeightedError).toBeCloseTo(960, 6);
  });

  it('computes summary across two markets', async () => {
    // Market 1: p=1.0, madeAt=0, end=1000 => tau=1000, brier=0, score=1000
    // Market 2: p=0.0, madeAt=0, end=500  => tau=500,  brier=1, score=0
    // sum=1000+0=1000, n=2
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xm1', marketId: 'c1' },
        { marketAddress: '0xm2', marketId: 'c2' },
      ])
      .mockResolvedValueOnce([
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xm1',
          marketId: 'c1',
          madeAt: 0,
          probabilityFloat: 1.0,
        },
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xm2',
          marketId: 'c2',
          madeAt: 0,
          probabilityFloat: 0.0,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c1', endTime: 1000, settled: true, resolvedToYes: true },
      { id: 'c2', endTime: 500, settled: true, resolvedToYes: true },
    ]);
    mockOutcome
      .mockReturnValueOnce(1) // c1
      .mockReturnValueOnce(1); // c2

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result.numTimeWeighted).toBe(2);
    expect(result.sumTimeWeightedError).toBeCloseTo(1000, 6);
  });

  it('filters out non-finite probability values', async () => {
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 1000,
          probabilityFloat: NaN,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 2000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result).toEqual({ sumTimeWeightedError: 0, numTimeWeighted: 0 });
  });

  it('skips markets whose condition is not settled', async () => {
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 500,
          probabilityFloat: 0.8,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 2000, settled: false, resolvedToYes: false },
    ]);
    mockOutcome.mockReturnValue(null);

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result).toEqual({ sumTimeWeightedError: 0, numTimeWeighted: 0 });
  });

  it('skips forecasts after end time', async () => {
    // madeAt=3000 > end=2000, so r.madeAt > m.end → skipped
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: ATTESTER.toLowerCase(),
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 3000,
          probabilityFloat: 0.5,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 2000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttesterSummary(ATTESTER);
    expect(result).toEqual({ sumTimeWeightedError: 0, numTimeWeighted: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeTimeWeightedForAttestersSummary
// ---------------------------------------------------------------------------
describe('computeTimeWeightedForAttestersSummary', () => {
  it('returns empty Map for empty input', async () => {
    const result = await computeTimeWeightedForAttestersSummary([]);
    expect(result.size).toBe(0);
  });

  it('computes summaries for two attesters each on one market', async () => {
    // Attester A: p=0.9, madeAt=0, end=1000 => tau=1000, brier=0.01, score=990
    // Attester B: p=0.5, madeAt=0, end=1000 => tau=1000, brier=0.25, score=750
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: '0xa',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 0,
          probabilityFloat: 0.9,
        },
        {
          attester: '0xb',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 0,
          probabilityFloat: 0.5,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 1000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttestersSummary(['0xA', '0xB']);

    expect(result.size).toBe(2);

    const a = result.get('0xa')!;
    expect(a.numTimeWeighted).toBe(1);
    expect(a.sumTimeWeightedError).toBeCloseTo(990, 6);

    const b = result.get('0xb')!;
    expect(b.numTimeWeighted).toBe(1);
    expect(b.sumTimeWeightedError).toBeCloseTo(750, 6);
  });

  it('includes attester with no valid forecasts as {0,0}', async () => {
    // Attester A has a forecast, attester B has none (all filtered)
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: '0xa',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 0,
          probabilityFloat: 0.9,
        },
        // 0xb has a forecast exactly at endTime (tau=0), so it's skipped
        {
          attester: '0xb',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 1000,
          probabilityFloat: 0.5,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 1000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttestersSummary(['0xA', '0xB']);

    expect(result.size).toBe(2);
    expect(result.has('0xa')).toBe(true);
    expect(result.has('0xb')).toBe(true);

    const a = result.get('0xa')!;
    expect(a.numTimeWeighted).toBe(1);
    expect(a.sumTimeWeightedError).toBeCloseTo(990, 6);

    const b = result.get('0xb')!;
    expect(b).toEqual({ sumTimeWeightedError: 0, numTimeWeighted: 0 });
  });

  it('ensures all requested attesters appear in result even with zero data', async () => {
    // Three attesters requested, only one has data
    mockPrisma.attestationScore.findMany
      .mockResolvedValueOnce([
        { marketAddress: '0xmarket', marketId: 'cond-1' },
      ])
      .mockResolvedValueOnce([
        {
          attester: '0xa',
          marketAddress: '0xmarket',
          marketId: 'cond-1',
          madeAt: 500,
          probabilityFloat: 1.0,
        },
      ]);

    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'cond-1', endTime: 1000, settled: true, resolvedToYes: true },
    ]);
    mockOutcome.mockReturnValue(1);

    const result = await computeTimeWeightedForAttestersSummary([
      '0xA',
      '0xB',
      '0xC',
    ]);

    expect(result.size).toBe(3);
    expect(result.has('0xa')).toBe(true);
    expect(result.has('0xb')).toBe(true);
    expect(result.has('0xc')).toBe(true);

    const a = result.get('0xa')!;
    // tau=500, brier=0, score=500
    expect(a.numTimeWeighted).toBe(1);
    expect(a.sumTimeWeightedError).toBeCloseTo(500, 6);

    expect(result.get('0xb')).toEqual({
      sumTimeWeightedError: 0,
      numTimeWeighted: 0,
    });
    expect(result.get('0xc')).toEqual({
      sumTimeWeightedError: 0,
      numTimeWeighted: 0,
    });
  });
});
