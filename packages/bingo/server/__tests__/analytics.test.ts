import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { buildAnalytics } from '../analytics.js';
import { SPONSORED_CARD_PRICE_WEI } from '../sponsorshipPolicy.js';
import type { SponsorshipHistory } from '../sponsorship.js';
import type { EntitlementRow } from '../types.js';

const CARD = SPONSORED_CARD_PRICE_WEI; // 10 USDe
const SELF = CARD * 2n; // a self-funded card priced above the sponsored amount
const P1 = '0x0000000000000000000000000000000000000001' as Address;
const P2 = '0x0000000000000000000000000000000000000002' as Address;
const REF = '0x00000000000000000000000000000000000000ff' as Address;

// A complete, fully-decided card with `wins` winning lines. Overridable.
function row(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    player: P1,
    poolId: 'pool-1',
    cardIndex: 0,
    cardPriceWei: SELF.toString(),
    linesFunded: 10,
    complete: true,
    wins: 0,
    decided: true,
    provisional: false,
    bonusOwedWei: '0',
    ref: null,
    referralOwedWei: null,
    receiptTokenId: '1',
    bonusPaidOnChain: false,
    referralPaidOnChain: false,
    ...over,
  };
}

function sponsorships(
  over: Partial<SponsorshipHistory> = {},
): SponsorshipHistory {
  return {
    sponsorAddress: '0x00000000000000000000000000000000000000aa' as Address,
    bankrollWei: (CARD * 100n).toString(),
    rows: [],
    ...over,
  };
}

describe('buildAnalytics', () => {
  it('counts cards, distinct players, and total staked', () => {
    const a = buildAnalytics(
      [row({ player: P1 }), row({ player: P2 }), row({ player: P1, cardIndex: 1 })],
      sponsorships(),
    );
    expect(a.cards.total).toBe(3);
    expect(a.cards.distinctPlayers).toBe(2);
    expect(a.staked.totalWei).toBe((SELF * 3n).toString());
  });

  it('classifies a card as sponsored only when price matches AND the player holds a grant', () => {
    const a = buildAnalytics(
      [
        row({ player: P1, cardPriceWei: CARD.toString() }), // sponsored price + grant
        row({ player: P2, cardPriceWei: CARD.toString() }), // sponsored price, NO grant
        row({ player: P1, cardIndex: 1, cardPriceWei: SELF.toString() }), // self-funded
      ],
      sponsorships({
        rows: [
          {
            smartAccount: P1,
            allocatedWei: CARD.toString(),
            usedWei: CARD.toString(),
            remainingWei: '0',
            played: true,
          },
        ],
      }),
    );
    expect(a.cards.sponsored).toBe(1);
    expect(a.cards.selfFunded).toBe(2);
    expect(a.staked.sponsoredWei).toBe(CARD.toString());
  });

  it('builds a win histogram over decided complete cards only', () => {
    const a = buildAnalytics(
      [
        row({ wins: 0, decided: true }),
        row({ wins: 3, decided: true }),
        row({ wins: 3, decided: true }),
        row({ wins: 5, decided: false, provisional: true }), // not counted: undecided
        row({ complete: false, wins: null, decided: null, provisional: null }),
      ],
      sponsorships(),
    );
    expect(a.wins.decidedCards).toBe(3);
    expect(a.wins.histogram[0]).toBe(1);
    expect(a.wins.histogram[3]).toBe(2);
    expect(a.wins.histogram[5]).toBe(0);
  });

  it('splits bonuses into payable, provisional, and paid', () => {
    const a = buildAnalytics(
      [
        // payable: decided, owed, unpaid
        row({ bonusOwedWei: CARD.toString(), decided: true, bonusPaidOnChain: false }),
        // provisional: complete but still growing — not yet payable
        row({
          bonusOwedWei: (CARD * 2n).toString(),
          decided: false,
          provisional: true,
          bonusPaidOnChain: false,
        }),
        // paid already
        row({ bonusOwedWei: CARD.toString(), decided: true, bonusPaidOnChain: true }),
        // owed nothing — ignored
        row({ bonusOwedWei: '0', decided: true }),
      ],
      sponsorships(),
    );
    expect(a.bonuses.payableWei).toBe(CARD.toString());
    expect(a.bonuses.payableCount).toBe(1);
    expect(a.bonuses.provisionalWei).toBe((CARD * 2n).toString());
    expect(a.bonuses.paidWei).toBe(CARD.toString());
    expect(a.bonuses.paidCount).toBe(1);
  });

  it('aggregates referrals and counts distinct referrers', () => {
    const a = buildAnalytics(
      [
        row({ ref: REF, referralOwedWei: CARD.toString(), referralPaidOnChain: false }),
        row({ ref: REF, referralOwedWei: CARD.toString(), referralPaidOnChain: true }),
        row({ ref: null, referralOwedWei: null }),
      ],
      sponsorships(),
    );
    expect(a.referrals.payableWei).toBe(CARD.toString());
    expect(a.referrals.payableCount).toBe(1);
    expect(a.referrals.paidWei).toBe(CARD.toString());
    expect(a.referrals.distinctReferrers).toBe(1);
  });

  it('passes through sponsorship totals from the grant listing', () => {
    const a = buildAnalytics(
      [],
      sponsorships({
        bankrollWei: (CARD * 50n).toString(),
        rows: [
          {
            smartAccount: P1,
            allocatedWei: (CARD * 2n).toString(),
            usedWei: CARD.toString(),
            remainingWei: CARD.toString(),
            played: true,
          },
          {
            smartAccount: P2,
            allocatedWei: CARD.toString(),
            usedWei: '0',
            remainingWei: CARD.toString(),
            played: false,
          },
        ],
      }),
    );
    expect(a.sponsorship.beneficiaries).toBe(2);
    expect(a.sponsorship.played).toBe(1);
    expect(a.sponsorship.allocatedWei).toBe((CARD * 3n).toString());
    expect(a.sponsorship.usedWei).toBe(CARD.toString());
    expect(a.sponsorship.remainingWei).toBe((CARD * 2n).toString());
    expect(a.sponsorship.bankrollWei).toBe((CARD * 50n).toString());
  });
});
