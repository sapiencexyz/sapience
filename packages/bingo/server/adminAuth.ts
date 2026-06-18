// SIWE admin sign-in: panel access for the treasury wallet, sponsor roles,
// and optional view-only extras (ADMIN_ADDRESSES). Grants are signed on-chain
// separately — only budgetManager / sponsor owner can call setBudget.
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
import { sponsorAddress } from './chain.js';
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

const SPONSOR_ROLES_ABI = [
  ...OWNER_ABI,
  {
    type: 'function',
    name: 'budgetManager',
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

function parseAdminAddresses(raw: string): Address[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as Address[];
}

/** Treasury wallet for admin panel: ADMIN_ADDRESS env if set, else receipt owner(). */
async function resolveTreasuryAddress(network: Network): Promise<Address> {
  if (env.ADMIN_ADDRESS) return env.ADMIN_ADDRESS as Address;
  return (await getPublicClient(network).readContract({
    address: NETWORK_CONFIG[network].receiptContract,
    abi: OWNER_ABI,
    functionName: 'owner',
  })) as Address;
}

/** Wallets allowed to SIWE-login: treasury + sponsor roles + view-only env extras. */
export async function resolveAdminAddresses(
  network: Network,
): Promise<Address[]> {
  const seen = new Set<string>();
  const out: Address[] = [];
  const add = (a: Address) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };

  add(await resolveTreasuryAddress(network));

  const sponsor = sponsorAddress(network);
  if (sponsor) {
    try {
      const [budgetManager, sponsorOwner] = await Promise.all([
        getPublicClient(network).readContract({
          address: sponsor,
          abi: SPONSOR_ROLES_ABI,
          functionName: 'budgetManager',
        }) as Promise<Address>,
        getPublicClient(network).readContract({
          address: sponsor,
          abi: SPONSOR_ROLES_ABI,
          functionName: 'owner',
        }) as Promise<Address>,
      ]);
      add(budgetManager);
      add(sponsorOwner);
    } catch (e) {
      console.warn(`[adminAuth] sponsor role read failed on ${network}:`, e);
    }
  }

  for (const a of parseAdminAddresses(env.ADMIN_ADDRESSES)) {
    add(a);
  }

  return out;
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

/** Verifies a SIWE message + signature from an allowlisted wallet and returns a
 *  bearer token. Throws Error with a user-facing message on any failure. */
export async function siweLogin(
  network: Network,
  message: string,
  signature: Hex,
  /** Host this admin endpoint was served on (req.headers.host). The signed
   *  message's `domain` must equal it — otherwise a message a wallet signs on
   *  another origin (phishing) is replayable here within the nonce window. */
  expectedDomain?: string,
): Promise<{ token: string; address: Address; expiresAt: number }> {
  const parsed = parseSiweMessage(message);
  if (!parsed.nonce || !verifyNonce(parsed.nonce)) {
    throw new Error('Unknown or expired nonce — fetch /api/admin/nonce first');
  }
  if (!parsed.address) throw new Error('SIWE message missing address');

  // Bind the signed message to THIS chain and origin, not just the bearer
  // token issued afterwards: the signature itself must not be reusable on
  // another chain or from another site.
  const expectedChainId = NETWORK_CONFIG[network].chain.id;
  if (parsed.chainId !== expectedChainId) {
    throw new Error(
      `SIWE chainId mismatch — expected ${expectedChainId} for ${network}`,
    );
  }
  if (expectedDomain && parsed.domain !== expectedDomain) {
    throw new Error('SIWE domain mismatch — message not signed for this origin');
  }

  const allowed = await resolveAdminAddresses(network);
  const signer = parsed.address.toLowerCase();
  if (!allowed.some((a) => a.toLowerCase() === signer)) {
    throw new Error('Not an authorized admin wallet');
  }

  // verifySiweMessage checks signature (EOA + ERC-1271/6492), expiry,
  // not-before, and that the embedded fields match the raw message. Pass
  // domain + nonce so it also asserts those against the expected values.
  const valid = await getPublicClient(network).verifySiweMessage({
    message,
    signature,
    nonce: parsed.nonce,
    ...(expectedDomain ? { domain: expectedDomain } : {}),
  });
  if (!valid) throw new Error('Invalid SIWE signature');

  const expiresAt = Date.now() + SESSION_TTL_MS;
  // network is bound into the payload: one backend serves both staging and
  // main, so a token must only authorize the network it was issued for —
  // otherwise a wallet allowlisted on one network could replay against the
  // other's admin endpoints.
  const payload = `${signer}:${network}:${expiresAt}`;
  const token = `${Buffer.from(payload).toString('base64url')}.${hmac(`token:${payload}`)}`;
  return { token, address: parsed.address, expiresAt };
}

/** Stateless bearer-token check: payload integrity + expiry + network match. */
export function isValidAdminSession(token: string, network: Network): boolean {
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = Buffer.from(token.slice(0, dot), 'base64url').toString();
  const [, tokenNetwork, exp] = payload.split(':');
  if (tokenNetwork !== network) return false;
  if (!exp || Number(exp) < Date.now()) return false;
  return safeEqual(token.slice(dot + 1), hmac(`token:${payload}`));
}
