// SIWE admin sign-in: the admin is whoever controls the treasury wallet —
// resolved on-chain as the BingoCardReceipt owner() (the address that can
// pay bonuses), with ADMIN_ADDRESS as an override/fallback. A successful
// SIWE login issues a short-lived bearer token that the /api/admin/* routes
// accept alongside the static ADMIN_TOKEN (kept for scripts/curl).

import { randomBytes } from 'node:crypto';
import type { Address, Hex } from 'viem';
import {
  generateSiweNonce,
  parseSiweMessage,
} from 'viem/siwe';
import { env } from './config.js';
import { getPublicClient } from './session.js';

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 12 * 3_600_000;

const nonces = new Map<string, number>(); // nonce → expiresAt
const sessions = new Map<string, { address: Address; expiresAt: number }>();

const OWNER_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

function sweep(): void {
  const now = Date.now();
  for (const [k, exp] of nonces) if (exp < now) nonces.delete(k);
  for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
}

/** The wallet allowed to sign in: ADMIN_ADDRESS env if set, else the
 *  receipt contract's owner() (the treasury that pays bonuses). */
export async function resolveAdminAddress(): Promise<Address | null> {
  if (env.ADMIN_ADDRESS) return env.ADMIN_ADDRESS as Address;
  if (!env.RECEIPT_CONTRACT_ADDRESS) return null;
  return (await getPublicClient().readContract({
    address: env.RECEIPT_CONTRACT_ADDRESS as Address,
    abi: OWNER_ABI,
    functionName: 'owner',
  })) as Address;
}

export function issueNonce(): string {
  sweep();
  const nonce = generateSiweNonce();
  nonces.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

/** Verifies a SIWE message + signature from the admin wallet and returns a
 *  bearer token. Throws Error with a user-facing message on any failure. */
export async function siweLogin(
  message: string,
  signature: Hex,
): Promise<{ token: string; address: Address; expiresAt: number }> {
  sweep();
  const parsed = parseSiweMessage(message);
  if (!parsed.nonce || !nonces.has(parsed.nonce)) {
    throw new Error('Unknown or expired nonce — fetch /api/admin/nonce first');
  }
  nonces.delete(parsed.nonce); // single-use
  if (!parsed.address) throw new Error('SIWE message missing address');

  const admin = await resolveAdminAddress();
  if (!admin) {
    throw new Error(
      'SIWE login unavailable: no ADMIN_ADDRESS and no receipt contract',
    );
  }
  if (parsed.address.toLowerCase() !== admin.toLowerCase()) {
    throw new Error('Not the treasury/admin wallet');
  }

  // verifySiweMessage checks signature (EOA + ERC-1271/6492), expiry,
  // not-before, and that the embedded fields match the raw message.
  const valid = await getPublicClient().verifySiweMessage({
    message,
    signature,
  });
  if (!valid) throw new Error('Invalid SIWE signature');

  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { address: parsed.address, expiresAt });
  return { token, address: parsed.address, expiresAt };
}

export function isValidAdminSession(token: string): boolean {
  const s = sessions.get(token);
  if (!s) return false;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}
