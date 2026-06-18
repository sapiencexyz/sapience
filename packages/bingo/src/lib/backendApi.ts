// Typed fetch client for the COMBO.BINGO backend service (bingo-server).
// The backend is STATELESS: the receipt NFT records each submission, escrow
// events record funded lines, and the client drives the 10 line mints as 10
// requests, sending its serialized session key with each one.

import type { Address, Hex } from 'viem';
import type { SerializedSession } from '~/lib/session/sessionKeyManager';
import { NETWORK, type Network } from '~/lib/chain';

// Each backend deployment serves ONE network, so the URL override is stored
// per network (`bingo-server-url:<network>`) — switching networks switches
// backends with it.
/** Pre-network-switch key; migrated to the staging slot on first read. */
const LEGACY_SERVER_URL_STORAGE_KEY = 'bingo-server-url';
/** Same origin: in production the platform serves this app and the API;
 *  in dev the Vite proxy forwards /api to the local server. */
const DEFAULT_SERVER_URL = '';
const REQUEST_TIMEOUT_MS = 30_000;
/** Submitting mints the receipt NFT synchronously (~10-20s). */
const SUBMIT_TIMEOUT_MS = 90_000;
/** A line request runs a full auction + mint synchronously. */
const LINE_TIMEOUT_MS = 180_000;

function migrateLegacyServerUrl(): void {
  const legacy = window.localStorage.getItem(LEGACY_SERVER_URL_STORAGE_KEY);
  if (legacy === null) return;
  // Overrides saved before the network switch existed pointed at a staging
  // (or local dev) server.
  if (window.localStorage.getItem('bingo-server-url:staging') === null) {
    window.localStorage.setItem('bingo-server-url:staging', legacy);
  }
  window.localStorage.removeItem(LEGACY_SERVER_URL_STORAGE_KEY);
}

export function loadServerUrl(network: Network = NETWORK): string {
  if (typeof window !== 'undefined') {
    migrateLegacyServerUrl();
    const v = window.localStorage.getItem(`bingo-server-url:${network}`);
    if (v && v.trim()) return v.trim().replace(/\/$/, '');
  }
  const envUrl = import.meta.env.VITE_BINGO_SERVER_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  return DEFAULT_SERVER_URL;
}

export function saveServerUrl(url: string, network: Network = NETWORK): void {
  if (typeof window === 'undefined') return;
  migrateLegacyServerUrl();
  const v = url.trim();
  const key = `bingo-server-url:${network}`;
  if (v) window.localStorage.setItem(key, v);
  else window.localStorage.removeItem(key);
}

// ---------------------------------------------------------------------------
// Response types — mirror bingo-server/src/handler.ts exactly.
// ---------------------------------------------------------------------------

export interface BackendCell {
  conditionId: Hex;
  resolver: Address;
  shortName?: string;
  question?: string;
  imageUrl?: string;
  /** Estimated YES probability (0–1) for the market, if known. */
  estimatedPrice?: number;
  /** Unix seconds; informational. */
  endTime?: number;
}

export interface PoolResponse {
  poolId: string;
  /** Display name for the pool's card header. Falls back to the default
   *  ("World Cup 2026") when absent. */
  title?: string;
  /** Which network the backend serves — compare against the app's NETWORK
   *  to catch a frontend pointed at the wrong backend. Optional so the app
   *  still works against backends that predate the network switch. */
  network?: Network;
  chainId?: number;
  /** 1-based display ordinal of the pool. */
  poolNumber: number;
  /** Unix seconds; submissions refused at/after this time. */
  cutoff: number;
  open: boolean;
  /** False when too few markets cleared the odds filter to deal a card; the
   *  pool is "currently unavailable". Optional for older backends. */
  available?: boolean;
  conditions: BackendCell[];
  /** Bonus multiplier in bps by winning-line count; length 11 (0..10). */
  multiplierBps: number[];
  referralBps: number;
  minCardPriceWei: string;
  fairnessCommitment: Hex;
  /** BingoCardReceipt contract (submission record + payout rail). */
  receiptContract: Address;
}

/** A selectable pool for the "+ New" card picker — one entry per open pool. */
export interface PoolSummary {
  poolId: string;
  /** Display name; null when the pool predates per-pool titles (fall back to
   *  the default "World Cup 2026"). */
  title?: string | null;
  /** 1-based display ordinal of the pool. */
  poolNumber: number;
  cutoff: number;
  open: boolean;
}

export interface CardLine {
  lineId: string;
  cellIndices: [number, number, number, number];
  /** On-chain: this line was minted at some point (escrow events). */
  funded: boolean;
}

export interface CardResponse {
  poolId: string;
  cutoff: number;
  open: boolean;
  player: Address;
  /** Which of the player's cards this is (0-based, sequential). */
  cardIndex: number;
  /** How many cards the player has submitted in this pool. */
  cardCount: number;
  /** The 16 dealt cells, in grid reading order. */
  cells: BackendCell[];
  /** Bit i = YES on cell i; null until submitted (from the receipt NFT). */
  yesMask: number | null;
  cardPriceWei: string | null;
  /** Milliseconds; null until submitted. */
  submittedAt: number | null;
  /** BingoCardReceipt NFT id; null until submitted. */
  receiptTokenId: string | null;
  lines: CardLine[];
}

export interface EntitlementRow {
  player: Address;
  poolId: string;
  cardIndex: number;
  cardPriceWei: string;
  linesFunded: number;
  complete: boolean;
  wins: number | null;
  /** True once no funded line's outcome can change. */
  decided: boolean | null;
  /** True while a complete card's owed amounts can still grow. Pay only
   *  when false. Null until complete. */
  provisional: boolean | null;
  bonusOwedWei: string | null;
  ref: Address | null;
  referralOwedWei: string | null;
  /** Receipt NFT id + on-chain one-shot paid flags. */
  receiptTokenId: string | null;
  bonusPaidOnChain: boolean | null;
  referralPaidOnChain: boolean | null;
}

export interface EntitlementsResponse {
  poolId: string;
  rows: EntitlementRow[];
  totalBonusOwedWei: string;
  totalReferralOwedWei: string;
}

export interface SubmitCardResponse {
  poolId: string;
  cardIndex: number;
  /** The receipt NFT minted (or already existing) for this card. */
  receiptTokenId: string;
}

export interface CardSummary {
  cardIndex: number;
  receiptTokenId: string;
  yesMask: number;
  cardPriceWei: string;
  /** Milliseconds. */
  submittedAt: number;
  linesFunded: number;
}

/** A card tagged with the pool it belongs to (the cross-pool list). */
export interface PoolCardSummary extends CardSummary {
  poolId: string;
  /** 1-based display ordinal of the pool. */
  poolNumber: number;
  poolOpen: boolean;
}

export interface CardsResponse {
  /** Active pool — drives the new-card flow. */
  poolId: string;
  /** Optional: backends that predate the cross-pool list omit these. */
  poolNumber?: number;
  open: boolean;
  cardCount: number;
  /** Cards in the ACTIVE pool only (the fill-previous gate's scope). */
  cards: CardSummary[];
  /** Every card the player holds, across all pools. */
  allCards?: PoolCardSummary[];
}

export interface SubmitLineResponse {
  lineIndex: number;
  funded: boolean;
  lineId?: string;
  txHash?: string | null;
  alreadyFunded?: boolean;
}

/** On-chain sponsorship state for a player (smart account). Mirrors
 *  bingo-server/sponsorship.ts SponsorStatus. */
export interface SponsorStatusResponse {
  /** Sponsorship is configured on this backend/network. */
  enabled: boolean;
  /** This player can mint a sponsored (no-deposit) card right now. */
  eligible: boolean;
  sponsorAddress: Address | null;
  allocatedWei: string;
  remainingWei: string;
  /** wUSDe the sponsor contract holds — the promo bankroll. */
  bankrollWei: string;
  /** Fixed price/budget of a sponsored card (wei). */
  sponsoredCardPriceWei: string;
}

export interface SponsorshipHistoryRow {
  smartAccount: Address;
  allocatedWei: string;
  usedWei: string;
  remainingWei: string;
  played: boolean;
}

export interface SponsorshipsResponse {
  sponsorAddress: Address | null;
  bankrollWei: string;
  rows: SponsorshipHistoryRow[];
}

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  // One backend serves both networks; every request says which one it's for.
  const sep = path.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch(`${loadServerUrl()}${path}${sep}network=${NETWORK}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`Backend request timed out (${path})`);
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    const msg =
      body && typeof body.error === 'string'
        ? body.error
        : `Backend ${res.status} (${path})`;
    throw new Error(msg);
  }
  if (body == null) throw new Error(`Backend returned no JSON (${path})`);
  return body;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function poolParam(poolId?: string | null): string {
  return poolId ? `&poolId=${encodeURIComponent(poolId)}` : '';
}

export function fetchPool(poolId?: string | null): Promise<PoolResponse> {
  return request<PoolResponse>(
    poolId ? `/api/pool?poolId=${encodeURIComponent(poolId)}` : '/api/pool',
  );
}

/** Every pool currently open for new cards (the "+ New" picker's options). */
export function fetchPools(): Promise<{ pools: PoolSummary[] }> {
  return request<{ pools: PoolSummary[] }>('/api/pools');
}

export function fetchCard(
  player: Address,
  cardIndex = 0,
  poolId?: string | null,
): Promise<CardResponse> {
  return request<CardResponse>(
    `/api/card?player=${encodeURIComponent(player)}&cardIndex=${cardIndex}${poolParam(poolId)}`,
  );
}

/** All the player's cards in the selected pool (drives the card selector). */
export function fetchCards(
  player: Address,
  poolId?: string | null,
): Promise<CardsResponse> {
  return request<CardsResponse>(
    `/api/cards?player=${encodeURIComponent(player)}${poolParam(poolId)}`,
  );
}

/** Public, shareable card lookup by receipt NFT id (no session needed). */
export function fetchReceiptCard(tokenId: string): Promise<CardResponse> {
  return request<CardResponse>(
    `/api/receipt?tokenId=${encodeURIComponent(tokenId)}`,
  );
}

/** Records the submission: the backend mints the receipt NFT, locking
 *  sides/price/referrer on-chain. Fund lines afterwards with submitLine. */
export function submitCard(params: {
  player: Address;
  poolId?: string | null;
  cardIndex: number;
  yesMask: number;
  cardPriceWei: string;
  ref?: Address | null;
  /** House-funds this card from the player's sponsorship budget (no deposit). */
  sponsored?: boolean;
  session: SerializedSession;
}): Promise<SubmitCardResponse> {
  return request<SubmitCardResponse>(
    '/api/card/submit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player: params.player,
        ...(params.poolId ? { poolId: params.poolId } : {}),
        cardIndex: params.cardIndex,
        yesMask: params.yesMask,
        cardPriceWei: params.cardPriceWei,
        session: params.session,
        ...(params.ref ? { ref: params.ref } : {}),
        ...(params.sponsored ? { sponsored: true } : {}),
      }),
    },
    SUBMIT_TIMEOUT_MS,
  );
}

/** Funds one line (auction + mint), synchronously. Idempotent — an
 *  already-funded line returns immediately. poolId pins the card's pool
 *  (defaults to the active pool server-side). */
export function submitLine(params: {
  player: Address;
  poolId?: string;
  cardIndex: number;
  lineIndex: number;
  session: SerializedSession;
}): Promise<SubmitLineResponse> {
  return request<SubmitLineResponse>(
    '/api/card/line',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    },
    LINE_TIMEOUT_MS,
  );
}

/** Stateless on-chain read of the player's sponsorship state. */
export function fetchSponsorStatus(
  player: Address,
): Promise<SponsorStatusResponse> {
  return request<SponsorStatusResponse>(
    `/api/sponsor/status?player=${encodeURIComponent(player)}`,
  );
}

export function fetchEntitlements(
  adminToken: string,
): Promise<EntitlementsResponse> {
  return request<EntitlementsResponse>('/api/admin/entitlements', {
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

export function fetchSponsorships(
  adminToken: string,
): Promise<SponsorshipsResponse> {
  return request<SponsorshipsResponse>('/api/admin/sponsorships', {
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

// ---- SIWE admin sign-in (treasury wallet) ----

export function fetchAdminNonce(): Promise<{ nonce: string }> {
  return request<{ nonce: string }>('/api/admin/nonce');
}

export function postAdminLogin(
  message: string,
  signature: string,
): Promise<{ token: string; address: Address; expiresAt: number }> {
  return request<{ token: string; address: Address; expiresAt: number }>(
    '/api/admin/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    },
  );
}
