// Typed fetch client for the COMBO.BINGO backend service (bingo-server).
// The backend is STATELESS: the receipt NFT records each submission, escrow
// events record funded lines, and the client drives the 10 line mints as 10
// requests, sending its serialized session key with each one.

import type { Address, Hex } from 'viem';
import type { SerializedSession } from '~/lib/session/sessionKeyManager';

const SERVER_URL_STORAGE_KEY = 'bingo-server-url';
/** Same origin: in production the platform serves this app and the API;
 *  in dev the Vite proxy forwards /api to the local server. */
const DEFAULT_SERVER_URL = '';
const REQUEST_TIMEOUT_MS = 30_000;
/** Submitting mints the receipt NFT synchronously (~10-20s). */
const SUBMIT_TIMEOUT_MS = 90_000;
/** A line request runs a full auction + mint synchronously. */
const LINE_TIMEOUT_MS = 180_000;

export function loadServerUrl(): string {
  if (typeof window !== 'undefined') {
    const v = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (v && v.trim()) return v.trim().replace(/\/$/, '');
  }
  const envUrl = import.meta.env.VITE_BINGO_SERVER_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  return DEFAULT_SERVER_URL;
}

export function saveServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const v = url.trim();
  if (v) window.localStorage.setItem(SERVER_URL_STORAGE_KEY, v);
  else window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
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
  /** Unix seconds; informational. */
  endTime?: number;
}

export interface PoolResponse {
  poolId: string;
  /** 1-based display ordinal of the pool. */
  poolNumber: number;
  /** Unix seconds; submissions refused at/after this time. */
  cutoff: number;
  open: boolean;
  conditions: BackendCell[];
  /** Bonus multiplier in bps by winning-line count; length 11 (0..10). */
  multiplierBps: number[];
  referralBps: number;
  minCardPriceWei: string;
  fairnessCommitment: Hex;
  /** BingoCardReceipt contract (submission record + payout rail). */
  receiptContract: Address;
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

export interface CardsResponse {
  poolId: string;
  open: boolean;
  cardCount: number;
  cards: CardSummary[];
}

export interface SubmitLineResponse {
  lineIndex: number;
  funded: boolean;
  lineId?: string;
  txHash?: string | null;
  alreadyFunded?: boolean;
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
  let res: Response;
  try {
    res = await fetch(`${loadServerUrl()}${path}`, {
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

export function fetchPool(): Promise<PoolResponse> {
  return request<PoolResponse>('/api/pool');
}

export function fetchCard(
  player: Address,
  cardIndex = 0,
): Promise<CardResponse> {
  return request<CardResponse>(
    `/api/card?player=${encodeURIComponent(player)}&cardIndex=${cardIndex}`,
  );
}

/** All the player's cards in the active pool (drives the card selector). */
export function fetchCards(player: Address): Promise<CardsResponse> {
  return request<CardsResponse>(
    `/api/cards?player=${encodeURIComponent(player)}`,
  );
}

/** Records the submission: the backend mints the receipt NFT, locking
 *  sides/price/referrer on-chain. Fund lines afterwards with submitLine. */
export function submitCard(params: {
  player: Address;
  cardIndex: number;
  yesMask: number;
  cardPriceWei: string;
  ref?: Address | null;
  session: SerializedSession;
}): Promise<SubmitCardResponse> {
  return request<SubmitCardResponse>(
    '/api/card/submit',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        player: params.player,
        cardIndex: params.cardIndex,
        yesMask: params.yesMask,
        cardPriceWei: params.cardPriceWei,
        session: params.session,
        ...(params.ref ? { ref: params.ref } : {}),
      }),
    },
    SUBMIT_TIMEOUT_MS,
  );
}

/** Funds one line (auction + mint), synchronously. Idempotent — an
 *  already-funded line returns immediately. */
export function submitLine(params: {
  player: Address;
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

export function fetchEntitlements(
  adminToken: string,
): Promise<EntitlementsResponse> {
  return request<EntitlementsResponse>('/api/admin/entitlements', {
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
