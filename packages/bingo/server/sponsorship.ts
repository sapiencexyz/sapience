// Sponsorship service: lets a new player mint a card without depositing.
// Ported from /app's packages/api/src/services/sponsorship.ts and adapted for
// bingo — per-network (one deployment serves staging + main), and `player` is
// ALREADY the smart account (bingo's predictor), so budgets are keyed by it
// directly. Reuses the SAME deployed OnboardingSponsor /app uses (resolved from
// the SDK contract registry) — no new contract. The escrow funds the predictor
// stake via the sponsor's fundMint hook; the sponsor enforces vault-counterparty
// + entry-price cap + per-user budget on-chain. See SPONSORSHIP_PLAN.md.
//
// All policy DECISIONS live in sponsorshipPolicy.ts (pure); this file is the IO
// boundary. The two orchestration entry points — ensureSponsoredBudget (submit)
// and getSponsoredLineContext (line) — take an injectable `deps` so they can be
// tested without a chain, and both FAIL CLOSED: a sponsored card is never locked
// in, and a line is never sponsored, unless the full context is confirmed.

import {
  createWalletClient,
  erc20Abi,
  http,
  type Address,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './config.js';
import { collateralAddress, sponsorAddress } from './chain.js';
import { chainFor, getPublicClient } from './session.js';
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
    type: 'function',
    name: 'setBudget',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'allocated', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
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

/** Sponsorship is on only when a budget-manager key is set AND the network has
 *  a deployed OnboardingSponsor. Otherwise bingo runs deposit-only. */
export function isSponsorshipEnabled(network: Network): boolean {
  return !!env.BUDGET_MANAGER_PRIVATE_KEY && sponsorAddress(network) !== null;
}

// ─── Low-level on-chain reads/writes (the real `deps`) ───────────────────────

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

// One budget-manager wallet client per network (the key is shared with /app).
const walletClients = new Map<Network, WalletClient>();

function budgetManagerClient(network: Network): WalletClient {
  let client = walletClients.get(network);
  if (!client) {
    const chain = chainFor(network);
    client = createWalletClient({
      account: privateKeyToAccount(
        env.BUDGET_MANAGER_PRIVATE_KEY as `0x${string}`,
      ),
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });
    walletClients.set(network, client);
  }
  return client;
}

/** Grant a full sponsored-card budget and AWAIT confirmation. Throws if the tx
 *  reverts or the receipt isn't successful — callers must fail closed. */
async function setBudgetConfirmed(
  network: Network,
  player: Address,
): Promise<void> {
  const sponsor = sponsorAddress(network);
  if (!sponsor) throw new Error('Sponsor not configured');
  const client = budgetManagerClient(network);
  const hash = await client.writeContract({
    address: sponsor,
    abi: SPONSOR_ABI,
    functionName: 'setBudget',
    args: [player, SPONSORED_CARD_PRICE_WEI],
    account: client.account!,
    chain: chainFor(network),
  });
  const receipt = await getPublicClient(network).waitForTransactionReceipt({
    hash,
  });
  if (receipt.status !== 'success') {
    throw new Error(`setBudget tx ${hash} reverted`);
  }
  console.log(`[sponsorship] granted ${player} on ${network}: ${hash}`);
}

/** Injectable IO boundary — real implementations by default; tests pass fakes. */
export interface SponsorshipDeps {
  getBudget: (
    network: Network,
    player: Address,
  ) => Promise<{ allocated: bigint; used: bigint }>;
  getBankroll: (network: Network) => Promise<bigint>;
  getRequiredCounterparty: (network: Network) => Promise<Address | null>;
  setBudget: (network: Network, player: Address) => Promise<void>;
}

const realDeps: SponsorshipDeps = {
  getBudget: readBudget,
  getBankroll: readBankroll,
  getRequiredCounterparty: requiredCounterparty,
  setBudget: setBudgetConfirmed,
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

// ─── Orchestration: submit (fail closed) ─────────────────────────────────────

/**
 * Ensure the player has a usable full sponsored-card budget BEFORE the receipt
 * is minted. FAILS CLOSED — throws on disabled config, dry bankroll, an
 * ineligible wallet, or a grant tx that doesn't confirm. Returns normally only
 * when the budget is on-chain (already held, or freshly granted + confirmed),
 * so a no-deposit card is never locked in without funding behind it.
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
  if (action.kind === 'grant') await deps.setBudget(network, player); // throws on failure
  // 'ok' → already holds a usable budget; nothing to do.
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
