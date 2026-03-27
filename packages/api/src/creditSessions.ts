/**
 * In-memory credit session store for x402 payments.
 *
 * Clients pay once for a credit bundle, receive a session token,
 * then spend credits across multiple queries — amortizing a single
 * on-chain gas cost over many requests.
 */
import { randomBytes } from 'crypto';

export type CreditSession = {
  wallet: string;
  credits: number;
  expiresAt: number;
};

const sessions = new Map<string, CreditSession>();
const MAX_CREDIT_SESSIONS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(token);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

export function createCreditSession(
  wallet: string,
  credits: number,
  ttlMs: number
): { token: string; credits: number; expiresAt: number } {
  // Enforce hard cap — evict expired first, then reject if still full
  if (sessions.size >= MAX_CREDIT_SESSIONS) {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    if (sessions.size >= MAX_CREDIT_SESSIONS) {
      throw new Error('Credit session limit reached');
    }
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ttlMs;
  sessions.set(token, { wallet, credits, expiresAt });
  startCleanup();

  return { token, credits, expiresAt };
}

export function getSession(token: string): CreditSession | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function deductCredits(token: string, amount: number): boolean {
  const session = getSession(token);
  if (!session || session.credits < amount) return false;
  session.credits -= amount;
  return true;
}

/**
 * Extract the payer wallet address from a base64-encoded x402 Payment-Signature header.
 * The header is a base64-encoded JSON object containing an `authorization` or
 * `permit2Authorization` field with a `from` address.
 */
export function extractPayerFromPaymentHeader(header: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    return (
      decoded?.authorization?.from ??
      decoded?.permit2Authorization?.from ??
      null
    );
  } catch {
    return null;
  }
}

/** Visible for testing — clear all sessions and stop cleanup timer. */
export function _resetForTest() {
  sessions.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
