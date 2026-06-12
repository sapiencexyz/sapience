// SIWE admin sign-in: the admin is whoever controls the treasury wallet —
// resolved on-chain as the BingoCardReceipt owner() (the address that can
// pay bonuses), with ADMIN_ADDRESS as an override/fallback.
//
// Fully stateless: nonces and session tokens are HMAC-signed values the
// server can verify without remembering them, so any instance (or a fresh
// serverless invocation) can validate what another issued. The trade-off vs
// the old in-memory single-use nonce: a nonce can be replayed within its
// 5-minute TTL — but only by someone holding the admin's signed message for
// it, i.e. the admin.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Address, Hex } from 'viem';
import { parseSiweMessage } from 'viem/siwe';
import { env } from './config.js';
import { NETWORK_CONFIG, type Network } from './network.js';
import { getPublicClient } from './session.js';

const NONCE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 12 * 3_600_000;

const OWNER_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
] as const;

function hmac(payload: string): string {
  return createHmac('sha256', `admin:${env.SERVER_SECRET}`)
    .update(payload)
    .digest('hex');
}

/** The wallet allowed to sign in: ADMIN_ADDRESS env if set, else the
 *  receipt contract's owner() (the treasury that pays bonuses). */
export async function resolveAdminAddress(network: Network): Promise<Address> {
  if (env.ADMIN_ADDRESS) return env.ADMIN_ADDRESS as Address;
  return (await getPublicClient(network).readContract({
    address: NETWORK_CONFIG[network].receiptContract,
    abi: OWNER_ABI,
    functionName: 'owner',
  })) as Address;
}

/** SIWE nonce: `<expiry-hex><hmac>` — alphanumeric (per the SIWE grammar),
 *  self-expiring, verifiable by any instance. */
export function issueNonce(): string {
  const exp = (Date.now() + NONCE_TTL_MS).toString(16).padStart(12, '0');
  return `${exp}${hmac(`nonce:${exp}`).slice(0, 32)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function verifyNonce(nonce: string): boolean {
  if (!/^[0-9a-f]{44}$/.test(nonce)) return false;
  const exp = nonce.slice(0, 12);
  if (parseInt(exp, 16) < Date.now()) return false;
  return safeEqual(nonce.slice(12), hmac(`nonce:${exp}`).slice(0, 32));
}

/** Verifies a SIWE message + signature from the admin wallet and returns a
 *  bearer token. Throws Error with a user-facing message on any failure. */
export async function siweLogin(
  network: Network,
  message: string,
  signature: Hex,
): Promise<{ token: string; address: Address; expiresAt: number }> {
  const parsed = parseSiweMessage(message);
  if (!parsed.nonce || !verifyNonce(parsed.nonce)) {
    throw new Error('Unknown or expired nonce — fetch /api/admin/nonce first');
  }
  if (!parsed.address) throw new Error('SIWE message missing address');

  const admin = await resolveAdminAddress(network);
  if (parsed.address.toLowerCase() !== admin.toLowerCase()) {
    throw new Error('Not the treasury/admin wallet');
  }

  // verifySiweMessage checks signature (EOA + ERC-1271/6492), expiry,
  // not-before, and that the embedded fields match the raw message.
  const valid = await getPublicClient(network).verifySiweMessage({
    message,
    signature,
  });
  if (!valid) throw new Error('Invalid SIWE signature');

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${parsed.address.toLowerCase()}:${expiresAt}`;
  const token = `${Buffer.from(payload).toString('base64url')}.${hmac(`token:${payload}`)}`;
  return { token, address: parsed.address, expiresAt };
}

/** Stateless bearer-token check: payload integrity + expiry. */
export function isValidAdminSession(token: string): boolean {
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = Buffer.from(token.slice(0, dot), 'base64url').toString();
  const [, exp] = payload.split(':');
  if (!exp || Number(exp) < Date.now()) return false;
  return safeEqual(token.slice(dot + 1), hmac(`token:${payload}`));
}
