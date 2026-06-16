// Sponsorship: lets a new player mint a card without depositing. Ported from
// /app's packages/api/src/services/sponsorship.ts and adapted for bingo —
//   - per-network (one deployment serves staging + main), and
//   - `player` is ALREADY the smart account (bingo's predictor), so unlike
//     /app we don't derive it from an EOA; budgets are keyed by it directly.
// Reuses the SAME deployed OnboardingSponsor /app uses (resolved from the SDK
// contract registry) — no new contract. The escrow funds the predictor stake
// via the sponsor's fundMint hook; the sponsor enforces vault-counterparty +
// entry-price cap + per-user budget on-chain. See SPONSORSHIP_PLAN.md.

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
  SPONSORED_CARD_PRICE_WEI,
  sponsorEligibility,
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
    type: 'function',
    name: 'remainingBudget',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    // public mapping getter — used for the E5 "never granted" guard.
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

/** On-chain sponsorship state for a player (smart account). Fully stateless —
 *  three reads: the player's budget (allocated/used), remaining, and the
 *  sponsor contract's wUSDe bankroll. */
export async function getSponsorStatus(
  network: Network,
  player: Address,
): Promise<SponsorStatus> {
  const sponsor = sponsorAddress(network);
  if (!isSponsorshipEnabled(network) || !sponsor) return DISABLED(network);

  const publicClient = getPublicClient(network);
  try {
    const [budget, remaining, bankroll] = await Promise.all([
      publicClient.readContract({
        address: sponsor,
        abi: SPONSOR_ABI,
        functionName: 'budgets',
        args: [player],
      }) as Promise<readonly [bigint, bigint]>,
      publicClient.readContract({
        address: sponsor,
        abi: SPONSOR_ABI,
        functionName: 'remainingBudget',
        args: [player],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: collateralAddress(network),
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [sponsor],
      }) as Promise<bigint>,
    ]);
    const allocated = budget[0];
    return {
      enabled: true,
      eligible: sponsorEligibility({
        allocated,
        remaining,
        bankroll,
        cardPrice: SPONSORED_CARD_PRICE_WEI,
      }),
      sponsorAddress: sponsor,
      allocatedWei: allocated.toString(),
      remainingWei: remaining.toString(),
      bankrollWei: bankroll.toString(),
      sponsoredCardPriceWei: SPONSORED_CARD_PRICE_WEI.toString(),
    };
  } catch (e) {
    console.warn(`[sponsorship] status read failed for ${player}:`, e);
    return DISABLED(network);
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

/**
 * Grant a sponsored-card budget to a player IFF they've never been granted
 * before (allocated === 0) and the bankroll can fund a card. Idempotent and
 * awaited to CONFIRMATION — bingo calls this from /api/card/submit before the
 * 10 line-mints run, and fundMint reverts if the budget isn't on-chain yet.
 * Returns the tx hash, or null if not granted (disabled / already granted /
 * bankroll dry).
 */
export async function grantBudgetIfNew(
  network: Network,
  player: Address,
): Promise<string | null> {
  const sponsor = sponsorAddress(network);
  if (!isSponsorshipEnabled(network) || !sponsor) return null;

  const status = await getSponsorStatus(network, player);
  // allocated !== 0 → already granted, never re-grant (E5).
  if (status.allocatedWei !== '0') return null;
  if (!status.eligible) return null; // bankroll can't cover a card (E9)

  try {
    const client = budgetManagerClient(network);
    const hash = await client.writeContract({
      address: sponsor,
      abi: SPONSOR_ABI,
      functionName: 'setBudget',
      args: [player, SPONSORED_CARD_PRICE_WEI],
      account: client.account!,
      chain: chainFor(network),
    });
    await getPublicClient(network).waitForTransactionReceipt({ hash });
    console.log(`[sponsorship] granted ${player} on ${network}: ${hash}`);
    return hash;
  } catch (e) {
    console.warn(`[sponsorship] grant failed for ${player}:`, e);
    return null;
  }
}

/** A player's remaining sponsorship budget (one read). Used by the line
 *  handler to decide, per line, whether the house funds the stake — which
 *  keeps funding correct across page reloads (no client-held "sponsored"
 *  flag to lose): each line is sponsored iff budget still covers its stake. */
export async function getRemainingBudget(
  network: Network,
  player: Address,
): Promise<bigint> {
  const sponsor = sponsorAddress(network);
  if (!sponsor) return 0n;
  try {
    return (await getPublicClient(network).readContract({
      address: sponsor,
      abi: SPONSOR_ABI,
      functionName: 'remainingBudget',
      args: [player],
    })) as bigint;
  } catch (e) {
    console.warn(`[sponsorship] remainingBudget read failed for ${player}:`, e);
    return 0n;
  }
}

/** The counterparty the sponsor will fund against (the vault). Sponsored line
 *  auctions must settle against it or the on-chain fundMint reverts, so the
 *  bid loop filters to it. Read from the contract — avoids hardcoding per
 *  network. Null when sponsorship is off. */
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
