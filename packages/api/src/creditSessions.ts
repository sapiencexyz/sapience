/**
 * Persistent credit session store for x402 payments (PostgreSQL via Prisma).
 *
 * Clients pay once for a credit bundle, receive a session token,
 * then spend credits across multiple queries — amortizing a single
 * on-chain gas cost over many requests.
 */
import { randomBytes } from 'crypto';
import prisma from './db';

export type CreditSession = {
  wallet: string;
  credits: number;
  expiresAt: number;
};

export async function createCreditSession(
  wallet: string,
  credits: number,
  ttlMs: number
): Promise<{ token: string; credits: number; expiresAt: number }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.creditSession.create({
    data: { token, wallet, credits, expiresAt },
  });

  return { token, credits, expiresAt: expiresAt.getTime() };
}

export async function getSession(token: string): Promise<CreditSession | null> {
  const row = await prisma.creditSession.findUnique({ where: { token } });
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    // Lazy-delete expired session
    await prisma.creditSession.delete({ where: { token } }).catch(() => {});
    return null;
  }

  return {
    wallet: row.wallet,
    credits: row.credits,
    expiresAt: row.expiresAt.getTime(),
  };
}

/**
 * Atomically deduct credits from a session.
 * Uses a single UPDATE … WHERE credits >= amount to avoid races.
 */
export async function deductCredits(
  token: string,
  amount: number
): Promise<boolean> {
  const now = new Date();
  const result = await prisma.$queryRaw<{ token: string }[]>`
    UPDATE credit_session
    SET credits = credits - ${amount}
    WHERE token = ${token}
      AND credits >= ${amount}
      AND "expiresAt" > ${now}
    RETURNING token
  `;
  return result.length > 0;
}

/** Delete all expired sessions (space reclamation). */
export async function cleanupExpiredSessions(): Promise<number> {
  const { count } = await prisma.creditSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
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
