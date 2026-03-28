/**
 * Persistent credit session store for x402 payments (PostgreSQL via Prisma).
 *
 * Clients pay once for a credit bundle, receive a session token,
 * then spend credits across multiple queries — amortizing a single
 * on-chain gas cost over many requests.
 *
 * Sessions never expire — they persist until credits are exhausted.
 */
import { randomBytes } from 'crypto';
import prisma from './db';

export type CreditSession = {
  wallet: string;
  credits: number;
};

export async function createCreditSession(
  wallet: string,
  credits: number
): Promise<{ token: string; credits: number }> {
  const token = randomBytes(32).toString('hex');

  await prisma.creditSession.create({
    data: { token, wallet, credits },
  });

  return { token, credits };
}

export async function getSession(token: string): Promise<CreditSession | null> {
  const row = await prisma.creditSession.findUnique({ where: { token } });
  if (!row) return null;

  return {
    wallet: row.wallet,
    credits: row.credits,
  };
}

/**
 * Atomically deduct credits from a session.
 * Uses a single UPDATE … WHERE credits >= amount to avoid races.
 * Returns the remaining credit balance, or null if the deduction failed
 * (unknown token or insufficient credits).
 */
export async function deductCredits(
  token: string,
  amount: number
): Promise<number | null> {
  const result = await prisma.$queryRaw<{ credits: number }[]>`
    UPDATE credit_session
    SET credits = credits - ${amount}
    WHERE token = ${token}
      AND credits >= ${amount}
    RETURNING credits
  `;
  return result.length > 0 ? result[0].credits : null;
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
