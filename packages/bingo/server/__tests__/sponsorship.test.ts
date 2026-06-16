import { describe, expect, it } from 'vitest';
import { sponsorEligibility } from '../sponsorshipPolicy.js';

const ONE = 10n ** 18n;
const CARD = 10n * ONE; // sponsored card = 10 USDe

describe('sponsorEligibility', () => {
  it('a never-granted wallet is eligible when the bankroll covers a card', () => {
    // allocated == 0 => first card free
    expect(
      sponsorEligibility({
        allocated: 0n,
        remaining: 0n,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(true);
  });

  it('a wallet with remaining budget is eligible', () => {
    expect(
      sponsorEligibility({
        allocated: CARD,
        remaining: CARD,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(true);
  });

  it('a partial leftover budget (< a full card) is NOT eligible (E11)', () => {
    // e.g. a 1-USDe /app budget can't fund a 10-USDe sponsored card.
    expect(
      sponsorEligibility({
        allocated: ONE,
        remaining: ONE,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });

  it('a spent wallet (allocated>0, remaining 0) is NOT eligible — no re-grant (E5)', () => {
    expect(
      sponsorEligibility({
        allocated: CARD,
        remaining: 0n,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });

  it('an under-funded bankroll blocks even a new wallet (E9)', () => {
    expect(
      sponsorEligibility({
        allocated: 0n,
        remaining: 0n,
        bankroll: CARD - 1n,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });
});
