import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import {
  isLineSponsored,
  isSponsoredCard,
  sponsorEligibility,
  sponsoredBudgetAction,
} from '../sponsorshipPolicy.js';
import {
  ensureSponsoredBudget,
  getSponsoredLineContext,
  SPONSORED_CARD_PRICE_WEI,
  type SponsorshipDeps,
} from '../sponsorship.js';

const ONE = 10n ** 18n;
const CARD = SPONSORED_CARD_PRICE_WEI; // 10 USDe
const THREE_CARDS = CARD * 3n;
const STAKE = CARD / 10n; // per-line stake = 1 USDe
const PLAYER = '0x0000000000000000000000000000000000000001' as Address;
const VAULT = '0x00000000000000000000000000000000000000aa' as Address;

// ─── Pure policy ─────────────────────────────────────────────────────────────

describe('sponsorEligibility', () => {
  it('a never-granted wallet is NOT eligible (admin must grant first)', () => {
    expect(
      sponsorEligibility({
        allocated: 0n,
        remaining: 0n,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });

  it('a wallet with a full remaining budget is eligible', () => {
    expect(
      sponsorEligibility({
        allocated: CARD,
        remaining: CARD,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(true);
  });

  it('a multi-card grant with enough remaining is eligible', () => {
    expect(
      sponsorEligibility({
        allocated: THREE_CARDS,
        remaining: CARD * 2n,
        bankroll: THREE_CARDS,
        cardPrice: CARD,
      }),
    ).toBe(true);
  });

  it('a partial leftover budget (< a full card) is NOT eligible (E11)', () => {
    expect(
      sponsorEligibility({
        allocated: ONE,
        remaining: ONE,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });

  it('a spent wallet (allocated>0, remaining 0) is NOT eligible', () => {
    expect(
      sponsorEligibility({
        allocated: CARD,
        remaining: 0n,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });

  it('an under-funded bankroll blocks even a granted wallet (E9)', () => {
    expect(
      sponsorEligibility({
        allocated: CARD,
        remaining: CARD,
        bankroll: CARD - 1n,
        cardPrice: CARD,
      }),
    ).toBe(false);
  });
});

describe('isSponsoredCard / isLineSponsored', () => {
  it('a full bingo grant at the sponsored price is a sponsored card', () => {
    expect(isSponsoredCard({ cardPriceWei: CARD, allocated: CARD })).toBe(true);
  });

  it('a multi-card bingo grant is a sponsored card', () => {
    expect(
      isSponsoredCard({ cardPriceWei: CARD, allocated: THREE_CARDS }),
    ).toBe(true);
  });

  it('a partial /app budget is NOT a sponsored card (E11)', () => {
    expect(isSponsoredCard({ cardPriceWei: CARD, allocated: ONE })).toBe(false);
  });

  it('a paid-price card is never a sponsored card', () => {
    expect(isSponsoredCard({ cardPriceWei: 20n * ONE, allocated: CARD })).toBe(
      false,
    );
  });

  it('a line of a sponsored card is sponsored while budget covers the stake', () => {
    expect(
      isLineSponsored({
        cardPriceWei: CARD,
        allocated: CARD,
        remaining: STAKE,
        stakePerLineWei: STAKE,
      }),
    ).toBe(true);
  });

  it('a line of a multi-card grant mid-burn is sponsored while budget covers stake', () => {
    expect(
      isLineSponsored({
        cardPriceWei: CARD,
        allocated: THREE_CARDS,
        remaining: CARD + STAKE,
        stakePerLineWei: STAKE,
      }),
    ).toBe(true);
  });

  it('a line is not sponsored once the budget no longer covers it', () => {
    expect(
      isLineSponsored({
        cardPriceWei: CARD,
        allocated: CARD,
        remaining: STAKE - 1n,
        stakePerLineWei: STAKE,
      }),
    ).toBe(false);
  });
});

describe('sponsoredBudgetAction', () => {
  it('rejects when the bankroll cannot cover a card', () => {
    expect(
      sponsoredBudgetAction({
        bankroll: CARD - 1n,
        allocated: 0n,
        remaining: 0n,
      }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });

  it('rejects a never-granted wallet (verify-only — no auto-grant)', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: 0n, remaining: 0n }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });

  it('is ok when remaining covers a full card', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: CARD, remaining: CARD }),
    ).toEqual({ kind: 'ok' });
  });

  it('is ok for a multi-card grant with enough remaining', () => {
    expect(
      sponsoredBudgetAction({
        bankroll: THREE_CARDS,
        allocated: THREE_CARDS,
        remaining: CARD * 2n,
      }),
    ).toEqual({ kind: 'ok' });
  });

  it('rejects a partial /app budget', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: ONE, remaining: ONE }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });

  it('rejects when remaining is below one card', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: CARD, remaining: 0n }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });
});

// ─── Orchestration (injected deps — no chain) ────────────────────────────────

function deps(over: Partial<SponsorshipDeps> = {}): SponsorshipDeps {
  return {
    getBudget: async () => ({ allocated: 0n, used: 0n }),
    getBankroll: async () => CARD * 5n,
    getRequiredCounterparty: async () => VAULT,
    ...over,
  };
}

describe('ensureSponsoredBudget', () => {
  it('rejects an un-granted wallet (verify-only)', async () => {
    await expect(
      ensureSponsoredBudget('main', PLAYER, deps()),
    ).rejects.toThrow(/not eligible|sponsored/i);
  });

  it('passes when remaining covers a full card', async () => {
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({
          getBudget: async () => ({ allocated: CARD, used: 0n }),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('passes mid multi-card burn-down with enough remaining for another card', async () => {
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({
          getBudget: async () => ({ allocated: THREE_CARDS, used: CARD * 2n }),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects the fourth card after a 30 USDe grant is exhausted', async () => {
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({
          getBudget: async () => ({ allocated: THREE_CARDS, used: THREE_CARDS }),
        }),
      ),
    ).rejects.toThrow();
  });

  it('throws on a dry bankroll even when the wallet has budget', async () => {
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({
          getBudget: async () => ({ allocated: CARD, used: 0n }),
          getBankroll: async () => CARD - 1n,
        }),
      ),
    ).rejects.toThrow();
  });

  it('throws for a partial /app budget', async () => {
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({ getBudget: async () => ({ allocated: ONE, used: 0n }) }),
      ),
    ).rejects.toThrow();
  });
});

describe('getSponsoredLineContext', () => {
  it('returns the sponsor context for a sponsored card mid-funding (resume)', async () => {
    const ctx = await getSponsoredLineContext(
      'main',
      PLAYER,
      CARD,
      STAKE,
      deps({ getBudget: async () => ({ allocated: CARD, used: 3n * STAKE }) }),
    );
    expect(ctx).not.toBeNull();
    expect(ctx?.requiredCounterparty).toBe(VAULT);
    expect(ctx?.sponsor).toBeTruthy();
  });

  it('returns sponsor context mid multi-card burn-down', async () => {
    const ctx = await getSponsoredLineContext(
      'main',
      PLAYER,
      CARD,
      STAKE,
      deps({
        getBudget: async () => ({
          allocated: THREE_CARDS,
          used: CARD + 3n * STAKE,
        }),
      }),
    );
    expect(ctx).not.toBeNull();
  });

  it('returns null for a paid card (price != sponsored amount)', async () => {
    const ctx = await getSponsoredLineContext(
      'main',
      PLAYER,
      20n * ONE,
      STAKE,
      deps(),
    );
    expect(ctx).toBeNull();
  });

  it('returns null for a partial /app budget — never sponsors a paid line (E11)', async () => {
    const ctx = await getSponsoredLineContext(
      'main',
      PLAYER,
      CARD,
      STAKE,
      deps({ getBudget: async () => ({ allocated: ONE, used: 0n }) }),
    );
    expect(ctx).toBeNull();
  });

  it('fails closed when the required counterparty cannot be read', async () => {
    await expect(
      getSponsoredLineContext(
        'main',
        PLAYER,
        CARD,
        STAKE,
        deps({
          getBudget: async () => ({ allocated: CARD, used: 0n }),
          getRequiredCounterparty: async () => null,
        }),
      ),
    ).rejects.toThrow();
  });
});
