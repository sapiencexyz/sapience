// Sponsorship service: lets a granted player mint a card without depositing.
// Ported from /app's packages/api/src/services/sponsorship.ts and adapted for
// bingo — per-network (one deployment serves staging + main), and `player` is
// ALREADY the smart account (bingo's predictor), so budgets are keyed by it
// directly. Reuses the SAME deployed OnboardingSponsor /app uses (resolved from
// the SDK contract registry) — no new contract. The escrow funds the predictor
// stake via the sponsor's fundMint hook; the sponsor enforces vault-counterparty
// + entry-price cap + per-user budget on-chain. See SPONSORSHIP_ADMIN_PLAN.md.
//
// All policy DECISIONS live in sponsorshipPolicy.ts (pure); this file is the IO
// boundary. The two orchestration entry points — ensureSponsoredBudget (submit)
// and getSponsoredLineContext (line) — take an injectable `deps` so they can be
// tested without a chain, and both FAIL CLOSED: a sponsored card is never locked
// in, and a line is never sponsored, unless the full context is confirmed.
// Grants are admin-managed (wallet-signed setBudget); the server never grants.

import { erc20Abi, type Address } from 'viem';
import { collateralAddress, sponsorAddress } from './chain.js';
import { getPublicClient } from './session.js';
import type { Network } from './network.js';
import {
  isLineSponsored,
  SPONSORED_CARD_PRICE_WEI,
  sponsorEligibility,
  sponsoredBudgetAction,
} from './sponsorshipPolicy.js';

export { SPONSORED_CARD_PRICE_WEI, sponsorEligibility };

// Only the OnboardingSponsor functions we touch.
const SPONSOR_ABI = [
  {
    // public mapping getter — allocated/used drive every sponsorship decision.
    type: 'function',
    name: 'budgets',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'allocated', type: 'uint256' },
      { name: 'used', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'requiredCounterparty',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/** Sponsorship is on when the network has a deployed OnboardingSponsor. */
export function isSponsorshipEnabled(network: Network): boolean {
  return sponsorAddress(network) !== null;
}

// ─── Low-level on-chain reads (the real `deps`) ──────────────────────────────

/** A player's on-chain budget: allocated grant + amount used so far. */
async function readBudget(
  network: Network,
  player: Address,
): Promise<{ allocated: bigint; used: bigint }> {
  const sponsor = sponsorAddress(network);
  if (!sponsor) return { allocated: 0n, used: 0n };
  const [allocated, used] = (await getPublicClient(network).readContract({
    address: sponsor,
    abi: SPONSOR_ABI,
    functionName: 'budgets',
    args: [player],
  })) as readonly [bigint, bigint];
  return { allocated, used };
}

/** wUSDe the sponsor contract holds — the promo bankroll fundMint pays from. */
async function readBankroll(network: Network): Promise<bigint> {
  const sponsor = sponsorAddress(network);
  if (!sponsor) return 0n;
  return (await getPublicClient(network).readContract({
    address: collateralAddress(network),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [sponsor],
  })) as bigint;
}

/** The counterparty the sponsor will fund against (the vault). Null only if the
 *  read fails or sponsorship is off — callers in sponsored mode treat null as a
 *  hard error (never sponsor a mint we can't pair with the required counterparty). */
export async function requiredCounterparty(
  network: Network,
): Promise<Address | null> {
  const sponsor = sponsorAddress(network);
  if (!sponsor) return null;
  try {
    return (await getPublicClient(network).readContract({
      address: sponsor,
      abi: SPONSOR_ABI,
      functionName: 'requiredCounterparty',
    })) as Address;
  } catch (e) {
    console.warn(`[sponsorship] requiredCounterparty read failed:`, e);
    return null;
  }
}

/** Injectable IO boundary — real implementations by default; tests pass fakes. */
export interface SponsorshipDeps {
  getBudget: (
    network: Network,
    player: Address,
  ) => Promise<{ allocated: bigint; used: bigint }>;
  getBankroll: (network: Network) => Promise<bigint>;
  getRequiredCounterparty: (network: Network) => Promise<Address | null>;
}

const realDeps: SponsorshipDeps = {
  getBudget: readBudget,
  getBankroll: readBankroll,
  getRequiredCounterparty: requiredCounterparty,
};

const remainingOf = (b: { allocated: bigint; used: bigint }): bigint =>
  b.allocated > b.used ? b.allocated - b.used : 0n;

// ─── Public read: drives the UI (status endpoint) ────────────────────────────

export interface SponsorStatus {
  enabled: boolean;
  eligible: boolean;
  sponsorAddress: Address | null;
  allocatedWei: string;
  remainingWei: string;
  bankrollWei: string;
  sponsoredCardPriceWei: string;
}

const DISABLED = (network: Network): SponsorStatus => ({
  enabled: false,
  eligible: false,
  sponsorAddress: sponsorAddress(network),
  allocatedWei: '0',
  remainingWei: '0',
  bankrollWei: '0',
  sponsoredCardPriceWei: SPONSORED_CARD_PRICE_WEI.toString(),
});

/** On-chain sponsorship state for a player (smart account). Stateless; never
 *  throws (UI read) — a read failure reports disabled. */
export async function getSponsorStatus(
  network: Network,
  player: Address,
  deps: SponsorshipDeps = realDeps,
): Promise<SponsorStatus> {
  const sponsor = sponsorAddress(network);
  if (!isSponsorshipEnabled(network) || !sponsor) return DISABLED(network);
  try {
    const [budget, bankroll] = await Promise.all([
      deps.getBudget(network, player),
      deps.getBankroll(network),
    ]);
    const remaining = remainingOf(budget);
    return {
      enabled: true,
      eligible: sponsorEligibility({
        allocated: budget.allocated,
        remaining,
        bankroll,
        cardPrice: SPONSORED_CARD_PRICE_WEI,
      }),
      sponsorAddress: sponsor,
      allocatedWei: budget.allocated.toString(),
      remainingWei: remaining.toString(),
      bankrollWei: bankroll.toString(),
      sponsoredCardPriceWei: SPONSORED_CARD_PRICE_WEI.toString(),
    };
  } catch (e) {
    console.warn(`[sponsorship] status read failed for ${player}:`, e);
    return DISABLED(network);
  }
}

// ─── Orchestration: submit (fail closed, verify-only) ────────────────────────

/**
 * Verify the player has a usable full sponsored-card budget BEFORE the receipt
 * is minted. FAILS CLOSED — throws on disabled config, dry bankroll, or
 * insufficient remaining budget. The server never grants; admin must setBudget
 * first.
 */
export async function ensureSponsoredBudget(
  network: Network,
  player: Address,
  deps: SponsorshipDeps = realDeps,
): Promise<void> {
  if (!isSponsorshipEnabled(network) || !sponsorAddress(network)) {
    throw new Error('Sponsorship is not enabled');
  }
  const [budget, bankroll] = await Promise.all([
    deps.getBudget(network, player),
    deps.getBankroll(network),
  ]);
  const action = sponsoredBudgetAction({
    bankroll,
    allocated: budget.allocated,
    remaining: remainingOf(budget),
  });
  if (action.kind === 'reject') throw new Error(action.reason);
}

// ─── Orchestration: line funding (complete context or fail) ──────────────────

export interface SponsoredLineContext {
  sponsor: Address;
  requiredCounterparty: Address;
}

/**
 * Resolve the sponsor context for one line, derived from the CARD (its price)
 * and the wallet's on-chain budget — never from leftover budget alone, so a
 * paid card (or a partial /app budget) is never accidentally sponsored, and the
 * decision survives a page reload. Returns:
 *   - null  → fund this line normally (not a sponsored card / budget exhausted);
 *   - {sponsor, requiredCounterparty} → house-fund it against the vault.
 * THROWS if the card is sponsored but the required counterparty can't be read —
 * we must never start an auction we can't pair with the counterparty fundMint
 * requires.
 */
export async function getSponsoredLineContext(
  network: Network,
  player: Address,
  cardPriceWei: bigint,
  stakePerLineWei: bigint,
  deps: SponsorshipDeps = realDeps,
): Promise<SponsoredLineContext | null> {
  const sponsor = sponsorAddress(network);
  if (!isSponsorshipEnabled(network) || !sponsor) return null;
  // Cheap card-level reject before any read: a paid card can't be sponsored.
  if (cardPriceWei !== SPONSORED_CARD_PRICE_WEI) return null;

  const budget = await deps.getBudget(network, player);
  if (
    !isLineSponsored({
      cardPriceWei,
      allocated: budget.allocated,
      remaining: remainingOf(budget),
      stakePerLineWei,
    })
  ) {
    return null;
  }

  const rc = await deps.getRequiredCounterparty(network);
  if (!rc) {
    throw new Error(
      'Sponsored line: required counterparty unavailable (read failed)',
    );
  }
  return { sponsor, requiredCounterparty: rc };
}
