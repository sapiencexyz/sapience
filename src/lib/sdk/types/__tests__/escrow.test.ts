import { describe, it, expect } from 'vitest';
import { OutcomeSide, isPredictedYes } from '../escrow';

describe('OutcomeSide', () => {
  it('NO = 0, YES = 1 (matches Solidity IV2Types.OutcomeSide)', () => {
    expect(OutcomeSide.NO).toBe(0);
    expect(OutcomeSide.YES).toBe(1);
  });
});

describe('isPredictedYes', () => {
  it('returns true for OutcomeSide.YES (1)', () => {
    expect(isPredictedYes(OutcomeSide.YES)).toBe(true);
    expect(isPredictedYes(1)).toBe(true);
  });

  it('returns false for OutcomeSide.NO (0)', () => {
    expect(isPredictedYes(OutcomeSide.NO)).toBe(false);
    expect(isPredictedYes(0)).toBe(false);
  });

  it('returns false for any non-YES value', () => {
    expect(isPredictedYes(2)).toBe(false);
    expect(isPredictedYes(-1)).toBe(false);
    expect(isPredictedYes(99)).toBe(false);
  });

  /**
   * Document the convention for Pyth and Polymarket/CT resolvers:
   *
   * Both resolver types use the same OutcomeSide enum:
   *   - Polymarket/CT: YES=1 means "Yes" outcome, NO=0 means "No" outcome
   *   - Pyth: YES=1 means "Over" (price above strike), NO=0 means "Under" (price below strike)
   *
   * In the UI:
   *   - Badge always shows "Yes"/"No" (not "Over"/"Under")
   *   - For Pyth, the question text contains the direction (e.g., "BTC OVER $71,329")
   */
  it('convention: Pyth Over maps to YES, Under maps to NO', () => {
    const predictorChoseOver = OutcomeSide.YES;
    const predictorChoseUnder = OutcomeSide.NO;

    expect(isPredictedYes(predictorChoseOver)).toBe(true);
    expect(isPredictedYes(predictorChoseUnder)).toBe(false);
  });

  it('convention: Polymarket Yes maps to YES, No maps to NO', () => {
    const predictorChoseYes = OutcomeSide.YES;
    const predictorChoseNo = OutcomeSide.NO;

    expect(isPredictedYes(predictorChoseYes)).toBe(true);
    expect(isPredictedYes(predictorChoseNo)).toBe(false);
  });
});
