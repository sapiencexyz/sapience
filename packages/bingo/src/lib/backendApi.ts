// Typed fetch client for the COMBO.BINGO backend service (bingo-server).
// The backend deals the card, runs the RFQ auctions, and mints escrow lines
// as the player via a scoped session key — there is no bingo contract.

import type { Address, Hex } from 'viem';
import type { SerializedSession } from '~/lib/session/sessionKeyManager';

const SERVER_URL_STORAGE_KEY = 'bingo-server-url';
/** Same origin: in production the bingo-server serves this app and the API;
 *  in dev the Vite proxy forwards /api to the local server. */
const DEFAULT_SERVER_URL = '';
const REQUEST_TIMEOUT_MS = 30_000;

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
// Response types — mirror bingo-server/src/server.ts exactly.
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
  /** Unix seconds; submissions refused at/after this time. */
  cutoff: number;
  open: boolean;
  conditions: BackendCell[];
  /** Bonus multiplier in bps by winning-line count; length 11 (0..10). */
  multiplierBps: number[];
  referralBps: number;
  minCardPriceWei: string;
  fairnessCommitment: Hex;
  /** BingoCardReceipt contract (payout rail), when configured. */
  receiptContract: Address | null;
}

export type BackendLineStatus =
  | 'pending'
  | 'quoting'
  | 'signing'
  | 'submitting'
  | 'done'
  | 'failed';

export interface CardLine {
  lineId: string;
  cellIndices: [number, number, number, number];
  /** On-chain: the line's escrow predictor position is funded. */
  funded: boolean;
  status?: BackendLineStatus;
  error?: string;
}

export interface CardResponse {
  poolId: string;
  cutoff: number;
  open: boolean;
  player: Address;
  /** The 16 dealt cells, in grid reading order. */
  cells: BackendCell[];
  /** Bit i = YES on cell i; null until submitted. */
  yesMask: number | null;
  cardPriceWei: string | null;
  submittedAt: number | null;
  hasSession: boolean;
  /** BingoCardReceipt NFT id, once minted (null if disabled/pending). */
  receiptTokenId: string | null;
  lines: CardLine[];
}

export interface PayoutRecord {
  type: 'payout';
  at: number;
  player: Address;
  poolId: string;
  kind: 'bonus' | 'referral';
  amountWei: string;
  to: Address;
  txHash?: string;
}

export interface EntitlementRow {
  player: Address;
  poolId: string;
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
  /** Receipt NFT id + on-chain one-shot paid flags, when configured. */
  receiptTokenId: string | null;
  bonusPaidOnChain: boolean | null;
  referralPaidOnChain: boolean | null;
  payouts: PayoutRecord[];
}

export interface EntitlementsResponse {
  poolId: string;
  rows: EntitlementRow[];
  totalBonusOwedWei: string;
  totalReferralOwedWei: string;
}

export interface SubmitCardResponse {
  accepted: boolean;
  poolId: string;
}

// ---------------------------------------------------------------------------
// Fetch plumbing
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
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

export function fetchCard(player: Address): Promise<CardResponse> {
  return request<CardResponse>(
    `/api/card?player=${encodeURIComponent(player)}`,
  );
}

export function postSession(
  serialized: SerializedSession,
): Promise<{ player: Address }> {
  return request<{ player: Address }>('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(serialized),
  });
}

export function submitCard(params: {
  player: Address;
  yesMask: number;
  cardPriceWei: string;
  ref?: Address | null;
}): Promise<SubmitCardResponse> {
  return request<SubmitCardResponse>('/api/card/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      player: params.player,
      yesMask: params.yesMask,
      cardPriceWei: params.cardPriceWei,
      ...(params.ref ? { ref: params.ref } : {}),
    }),
  });
}

export function fetchEntitlements(
  adminToken: string,
): Promise<EntitlementsResponse> {
  return request<EntitlementsResponse>('/api/admin/entitlements', {
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

/** Creates a new pool (becomes active immediately). The server generates a
 *  fresh fairness secret and returns its commitment. */
export function postAdminPool(
  adminToken: string,
  pool: {
    poolId: string;
    cutoff: number;
    minCardPriceWei: string;
    referralBps: number;
    multiplierBps: number[];
    conditions: BackendCell[];
  },
): Promise<{ poolId: string; cutoff: number; fairnessCommitment: Hex }> {
  return request('/api/admin/pool', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(pool),
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
