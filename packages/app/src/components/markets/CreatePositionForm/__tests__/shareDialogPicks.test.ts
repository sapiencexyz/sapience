import { describe, it, expect } from 'vitest';

/**
 * Tests for the share dialog pick construction logic used in handlePositionSubmit.
 * Verifies that Pyth predictions are included alongside Polymarket selections
 * in the share card OG image.
 */

// Types matching what handlePositionSubmit uses
type Selection = {
  conditionId: string;
  question: string;
  prediction: boolean;
};

type PythPrediction = {
  id: string;
  priceId: string;
  priceFeedLabel?: string;
  direction: 'over' | 'under';
  targetPrice: number;
  targetPriceRaw?: string;
  targetPriceFullPrecision?: string;
  priceExpo: number;
  dateTimeLocal: string;
};

// Extracted from handlePositionSubmit in CreatePositionForm/index.tsx
function buildDialogPicks(
  selections: Selection[],
  pythPredictions: PythPrediction[]
) {
  const polymarketPicks = selections.map((s) => ({
    conditionId: s.conditionId,
    question: s.question,
    choice: s.prediction ? 'Yes' : ('No' as 'Yes' | 'No'),
  }));
  const pythPicks = pythPredictions.map((p) => ({
    conditionId: p.id,
    question: `${p.priceFeedLabel ?? 'Crypto'} ${p.direction.toUpperCase()} $${p.targetPrice.toLocaleString()}`,
    choice: 'Yes' as const,
  }));
  return [...polymarketPicks, ...pythPicks];
}

// Matches the expectedPicks mapping in the share dialog
function buildExpectedPicks(
  picks: Array<{ conditionId: string; choice: string }>
) {
  return picks.map((p) => ({
    conditionId: p.conditionId,
    predictedOutcome: p.choice === 'Yes' ? 0 : 1,
  }));
}

describe('shareDialogPicks', () => {
  const makePythPrediction = (
    overrides: Partial<PythPrediction> = {}
  ): PythPrediction => ({
    id: 'pyth-1',
    priceId: '0xabc',
    priceFeedLabel: 'Crypto.BTC/USD',
    direction: 'over',
    targetPrice: 71426.18,
    priceExpo: -8,
    dateTimeLocal: '2026-03-18T15:01',
    ...overrides,
  });

  it('builds picks from Pyth predictions when selections are empty', () => {
    const picks = buildDialogPicks([], [makePythPrediction()]);

    expect(picks).toHaveLength(1);
    expect(picks[0].question).toBe('Crypto.BTC/USD OVER $71,426.18');
    expect(picks[0].choice).toBe('Yes');
    expect(picks[0].conditionId).toBe('pyth-1');
  });

  it('builds picks from Polymarket selections when no Pyth predictions', () => {
    const selections: Selection[] = [
      {
        conditionId: '0xCond1',
        question: 'Will BTC hit 100k?',
        prediction: true,
      },
    ];
    const picks = buildDialogPicks(selections, []);

    expect(picks).toHaveLength(1);
    expect(picks[0].question).toBe('Will BTC hit 100k?');
    expect(picks[0].choice).toBe('Yes');
  });

  it('combines Polymarket and Pyth picks in a combo', () => {
    const selections: Selection[] = [
      {
        conditionId: '0xCond1',
        question: 'Will BTC hit 100k?',
        prediction: true,
      },
    ];
    const pyth = [makePythPrediction()];
    const picks = buildDialogPicks(selections, pyth);

    expect(picks).toHaveLength(2);
    expect(picks[0].question).toBe('Will BTC hit 100k?');
    expect(picks[1].question).toBe('Crypto.BTC/USD OVER $71,426.18');
  });

  it('handles UNDER direction', () => {
    const picks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'under', targetPrice: 50000 })]
    );

    expect(picks[0].question).toBe('Crypto.BTC/USD UNDER $50,000');
    expect(picks[0].choice).toBe('Yes');
  });

  it('uses "Crypto" fallback when priceFeedLabel is missing', () => {
    const picks = buildDialogPicks(
      [],
      [makePythPrediction({ priceFeedLabel: undefined })]
    );

    expect(picks[0].question).toContain('Crypto');
  });

  it('maps Pyth picks to predictedOutcome 0 (always Yes)', () => {
    // Pyth picks always use choice "Yes" regardless of direction —
    // the direction is encoded in the question text (e.g. "BTC OVER $71k" → Yes)
    const overPicks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'over' })]
    );
    const underPicks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'under' })]
    );

    const overExpected = buildExpectedPicks(overPicks);
    const underExpected = buildExpectedPicks(underPicks);

    expect(overExpected[0].predictedOutcome).toBe(0); // Yes → 0
    expect(underExpected[0].predictedOutcome).toBe(0); // Yes → 0
  });

  it('handles multiple Pyth predictions', () => {
    const pyth = [
      makePythPrediction({ id: 'p1', priceFeedLabel: 'Crypto.BTC/USD' }),
      makePythPrediction({
        id: 'p2',
        priceFeedLabel: 'Crypto.ETH/USD',
        direction: 'under',
        targetPrice: 3500,
      }),
    ];
    const picks = buildDialogPicks([], pyth);

    expect(picks).toHaveLength(2);
    expect(picks[0].conditionId).toBe('p1');
    expect(picks[1].conditionId).toBe('p2');
    expect(picks[1].question).toBe('Crypto.ETH/USD UNDER $3,500');
  });
});
