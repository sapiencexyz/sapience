import { describe, it, expect } from 'vitest';
import type { PythPrediction } from '@sapience/ui';
import { buildDialogPicks } from '../buildDialogPicks';

/**
 * Tests for the share dialog pick construction logic used in handlePositionSubmit.
 * Verifies that Pyth predictions are included alongside Polymarket selections
 * in the share card OG image.
 */

describe('buildDialogPicks', () => {
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
    expect(picks[0].question).toBe('Crypto.BTC/USD > $71,426.18');
    expect(picks[0].choice).toBe('Yes');
    expect(picks[0].source).toBe('pyth');
    expect(picks[0].conditionId).toBe('pyth-1');
  });

  it('builds picks from Polymarket selections when no Pyth predictions', () => {
    const selections = [
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
    expect(picks[0].source).toBe('polymarket');
  });

  it('combines Polymarket and Pyth picks in a combo', () => {
    const selections = [
      {
        conditionId: '0xCond1',
        question: 'Will BTC hit 100k?',
        prediction: true,
      },
    ];
    const pyth = [makePythPrediction()];
    const picks = buildDialogPicks(selections, pyth);

    expect(picks).toHaveLength(2);
    expect(picks[0].source).toBe('polymarket');
    expect(picks[0].question).toBe('Will BTC hit 100k?');
    expect(picks[1].source).toBe('pyth');
    expect(picks[1].question).toBe('Crypto.BTC/USD > $71,426.18');
  });

  it('handles UNDER direction — question still uses >, choice is No', () => {
    const picks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'under', targetPrice: 50000 })]
    );

    expect(picks[0].question).toBe('Crypto.BTC/USD > $50,000');
    expect(picks[0].choice).toBe('No');
    expect(picks[0].source).toBe('pyth');
  });

  it('uses "Crypto" fallback when priceFeedLabel is missing', () => {
    const picks = buildDialogPicks(
      [],
      [makePythPrediction({ priceFeedLabel: undefined })]
    );

    expect(picks[0].question).toContain('Crypto');
  });

  it('Pyth picks always have source=pyth', () => {
    const overPicks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'over' })]
    );
    const underPicks = buildDialogPicks(
      [],
      [makePythPrediction({ direction: 'under' })]
    );

    expect(overPicks[0].source).toBe('pyth');
    expect(underPicks[0].source).toBe('pyth');
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
    expect(picks[0].choice).toBe('Yes');
    expect(picks[1].conditionId).toBe('p2');
    expect(picks[1].choice).toBe('No');
    expect(picks[1].question).toBe('Crypto.ETH/USD > $3,500');
  });
});
