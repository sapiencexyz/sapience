import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { buildTreasuryReport } from '../treasury.js';
import { SPONSORED_CARD_PRICE_WEI } from '../sponsorshipPolicy.js';
import type { EntitlementRow } from '../types.js';

const CARD = SPONSORED_CARD_PRICE_WEI; // 10 USDe, used as a round stake
const P1 = '0x0000000000000000000000000000000000000001' as Address;
const P2 = '0x0000000000000000000000000000000000000002' as Address;
const P3 = '0x0000000000000000000000000000000000000003' as Address;
const OUTSIDER = '0x00000000000000000000000000000000000000ff' as Address;

function row(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    player: P1,
    poolId: 'pool-1',
    cardIndex: 0,
    cardPriceWei: CARD.toString(),
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

describe('buildTreasuryReport — winners', () => {
  it('lists only bonus-winning cards and derives the multiplier from price + bonus', () => {
    const r = buildTreasuryReport([
      // 2.5x multiplier: bonus = 2.5 * stake
      row({ wins: 5, bonusOwedWei: ((CARD * 25n) / 10n).toString() }),
      // no bonus — excluded
      row({ cardIndex: 1, wins: 0, bonusOwedWei: '0' }),
    ]);
    expect(r.winners).toHaveLength(1);
    expect(r.winners[0].multiplierBps).toBe(25000); // 2.5x = 25000 bps
    expect(r.winners[0].wins).toBe(5);
  });

  it('sorts winners by multiplier descending', () => {
    const r = buildTreasuryReport([
      row({ cardIndex: 0, bonusOwedWei: CARD.toString() }), // 1x
      row({ cardIndex: 1, bonusOwedWei: (CARD * 4n).toString() }), // 4x
      row({ cardIndex: 2, bonusOwedWei: (CARD * 2n).toString() }), // 2x
    ]);
    expect(r.winners.map((w) => w.multiplierBps)).toEqual([40000, 20000, 10000]);
  });
});

describe('buildTreasuryReport — re-roll grinding', () => {
  it('flags a funded card sitting above an abandoned (0-line) index', () => {
    const r = buildTreasuryReport([
      row({ player: P1, cardIndex: 0, linesFunded: 0, complete: false }), // abandoned
      row({ player: P1, cardIndex: 1, linesFunded: 10, bonusOwedWei: CARD.toString() }),
    ]);
    const p1 = r.players.find((p) => p.player === P1)!;
    expect(p1.riskFlags).toContain('reroll');
    expect(p1.abandonedBelowFunded).toBe(1);
    const winner = r.winners.find((w) => w.cardIndex === 1)!;
    expect(winner.flags).toContain('reroll');
  });

  it('does NOT flag a player who funded every card in order', () => {
    const r = buildTreasuryReport([
      row({ player: P2, cardIndex: 0, linesFunded: 10 }),
      row({ player: P2, cardIndex: 1, linesFunded: 10 }),
    ]);
    const p2 = r.players.find((p) => p.player === P2)!;
    expect(p2.riskFlags).not.toContain('reroll');
    expect(p2.abandonedBelowFunded).toBe(0);
  });
});

describe('buildTreasuryReport — referral rings', () => {
  it('flags a self-referral (ref == player)', () => {
    const r = buildTreasuryReport([row({ player: P1, ref: P1 })]);
    expect(r.players.find((p) => p.player === P1)!.riskFlags).toContain(
      'self-referral',
    );
  });

  it('flags a reciprocal referral pair (A→B and B→A)', () => {
    const r = buildTreasuryReport([
      row({ player: P1, ref: P2 }),
      row({ player: P2, cardIndex: 0, ref: P1 }),
    ]);
    expect(r.players.find((p) => p.player === P1)!.riskFlags).toContain(
      'referral-ring',
    );
    expect(r.players.find((p) => p.player === P2)!.riskFlags).toContain(
      'referral-ring',
    );
  });

  it('does not ring-flag a referral pointing at a non-player outsider', () => {
    const r = buildTreasuryReport([row({ player: P1, ref: OUTSIDER })]);
    expect(r.players.find((p) => p.player === P1)!.riskFlags).not.toContain(
      'referral-ring',
    );
  });
});

describe('buildTreasuryReport — win-rate outliers', () => {
  it('flags a player whose win rate far exceeds the population base rate', () => {
    // Population: P2 + P3 win ~1/10 lines; P1 wins 10/10 on enough cards.
    const lowWinners = [P2, P3].flatMap((player) =>
      Array.from({ length: 5 }, (_, i) =>
        row({ player, cardIndex: i, wins: 1, decided: true }),
      ),
    );
    const grinder = Array.from({ length: 3 }, (_, i) =>
      row({ player: P1, cardIndex: i, wins: 10, decided: true }),
    );
    const r = buildTreasuryReport([...lowWinners, ...grinder]);
    expect(r.players.find((p) => p.player === P1)!.riskFlags).toContain(
      'win-rate-outlier',
    );
    expect(r.players.find((p) => p.player === P2)!.riskFlags).not.toContain(
      'win-rate-outlier',
    );
  });

  it('does not flag a high rate on too small a sample', () => {
    const r = buildTreasuryReport([
      row({ player: P1, cardIndex: 0, wins: 10, decided: true }),
      row({ player: P2, cardIndex: 0, wins: 1, decided: true }),
    ]);
    // P1 has only 1 decided card — below the min sample.
    expect(r.players.find((p) => p.player === P1)!.riskFlags).not.toContain(
      'win-rate-outlier',
    );
  });
});

describe('buildTreasuryReport — concentration', () => {
  it('flags a player holding an outsized share of total bonus owed', () => {
    const r = buildTreasuryReport([
      row({ player: P1, cardIndex: 0, bonusOwedWei: (CARD * 90n).toString() }),
      row({ player: P2, cardIndex: 0, bonusOwedWei: (CARD * 10n).toString() }),
    ]);
    expect(r.players.find((p) => p.player === P1)!.riskFlags).toContain(
      'concentration',
    );
    expect(r.players.find((p) => p.player === P2)!.riskFlags).not.toContain(
      'concentration',
    );
  });
});
