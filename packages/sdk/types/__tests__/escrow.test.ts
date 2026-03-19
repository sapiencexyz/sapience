import { describe, it, expect } from 'vitest';
import { OutcomeSide, isPredictedYes } from '../escrow';

describe('OutcomeSide', () => {
  it('YES = 0, NO = 1 (matches Solidity IV2Types.OutcomeSide)', () => {
    expect(OutcomeSide.YES).toBe(0);
    expect(OutcomeSide.NO).toBe(1);
  });
});

describe('isPredictedYes', () => {
  it('returns true for OutcomeSide.YES (0)', () => {
    expect(isPredictedYes(OutcomeSide.YES)).toBe(true);
    expect(isPredictedYes(0)).toBe(true);
  });

  it('returns false for OutcomeSide.NO (1)', () => {
    expect(isPredictedYes(OutcomeSide.NO)).toBe(false);
    expect(isPredictedYes(1)).toBe(false);
  });

  it('returns false for any non-zero value', () => {
    expect(isPredictedYes(2)).toBe(false);
    expect(isPredictedYes(-1)).toBe(false);
    expect(isPredictedYes(99)).toBe(false);
  });

  /**
   * Document the convention for Pyth and Polymarket/CT resolvers:
   *
   * Both resolver types use the same OutcomeSide enum:
   *   - Polymarket/CT: YES=0 means "Yes" outcome, NO=1 means "No" outcome
   *   - Pyth: YES=0 means "Over" (price above strike), NO=1 means "Under" (price below strike)
   *
   * In the UI:
   *   - Badge always shows "Yes"/"No" (not "Over"/"Under")
   *   - For Pyth, the question text contains the direction (e.g., "BTC OVER $71,329")
   */
  it('convention: Pyth Over maps to YES (0), Under maps to NO (1)', () => {
    const predictorChoseOver = 0; // OutcomeSide.YES
    const predictorChoseUnder = 1; // OutcomeSide.NO

    expect(isPredictedYes(predictorChoseOver)).toBe(true);
    expect(isPredictedYes(predictorChoseUnder)).toBe(false);
  });

  it('convention: Polymarket Yes maps to YES (0), No maps to NO (1)', () => {
    const predictorChoseYes = 0; // OutcomeSide.YES
    const predictorChoseNo = 1; // OutcomeSide.NO

    expect(isPredictedYes(predictorChoseYes)).toBe(true);
    expect(isPredictedYes(predictorChoseNo)).toBe(false);
  });
});
