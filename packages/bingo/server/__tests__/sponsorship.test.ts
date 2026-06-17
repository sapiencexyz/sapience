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
const STAKE = CARD / 10n; // per-line stake = 1 USDe
const PLAYER = '0x0000000000000000000000000000000000000001' as Address;
const VAULT = '0x00000000000000000000000000000000000000aa' as Address;

// ─── Pure policy ─────────────────────────────────────────────────────────────

describe('sponsorEligibility', () => {
  it('a never-granted wallet is eligible when the bankroll covers a card', () => {
    expect(
      sponsorEligibility({
        allocated: 0n,
        remaining: 0n,
        bankroll: CARD,
        cardPrice: CARD,
      }),
    ).toBe(true);
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

describe('isSponsoredCard / isLineSponsored', () => {
  it('a full bingo grant at the sponsored price is a sponsored card', () => {
    expect(isSponsoredCard({ cardPriceWei: CARD, allocated: CARD })).toBe(true);
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
      sponsoredBudgetAction({ bankroll: CARD - 1n, allocated: 0n, remaining: 0n }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });
  it('grants for a never-granted wallet', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: 0n, remaining: 0n }),
    ).toEqual({ kind: 'grant' });
  });
  it('is ok for a full unspent budget (no re-grant)', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: CARD, remaining: CARD }),
    ).toEqual({ kind: 'ok' });
  });
  it('rejects a partial /app budget', () => {
    expect(
      sponsoredBudgetAction({ bankroll: CARD, allocated: ONE, remaining: ONE }),
    ).toEqual({ kind: 'reject', reason: expect.any(String) });
  });
  it('rejects an already-spent bingo budget', () => {
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
    setBudget: async () => {},
    ...over,
  };
}

describe('ensureSponsoredBudget', () => {
  it('grants for a new eligible wallet', async () => {
    const setBudget = vi.fn(async () => {});
    await expect(
      ensureSponsoredBudget('main', PLAYER, deps({ setBudget })),
    ).resolves.toBeUndefined();
    expect(setBudget).toHaveBeenCalledOnce();
  });

  it('fails closed when the grant tx fails (no swallow)', async () => {
    const setBudget = vi.fn(async () => {
      throw new Error('tx reverted');
    });
    await expect(
      ensureSponsoredBudget('main', PLAYER, deps({ setBudget })),
    ).rejects.toThrow('tx reverted');
  });

  it('does NOT re-grant an already-funded eligible wallet', async () => {
    const setBudget = vi.fn(async () => {});
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({
          getBudget: async () => ({ allocated: CARD, used: 0n }),
          setBudget,
        }),
      ),
    ).resolves.toBeUndefined();
    expect(setBudget).not.toHaveBeenCalled();
  });

  it('throws on a dry bankroll before any grant', async () => {
    const setBudget = vi.fn(async () => {});
    await expect(
      ensureSponsoredBudget(
        'main',
        PLAYER,
        deps({ getBankroll: async () => CARD - 1n, setBudget }),
      ),
    ).rejects.toThrow();
    expect(setBudget).not.toHaveBeenCalled();
  });

  it('throws for a partial /app budget (not eligible)', async () => {
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

  it('returns null for a paid card (price != sponsored amount)', async () => {
    const ctx = await getSponsoredLineContext('main', PLAYER, 20n * ONE, STAKE, deps());
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
