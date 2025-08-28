import { verifyMessage } from 'viem';
import crypto from 'crypto';

export type ChatSession = { address: string; expiresAt: number };
export type NonceRecord = { message: string; expiresAt: number; used: boolean };

// In-memory stores; fine for single-instance deployments. For multi-instance, move to Redis.
const nonces = new Map<string, NonceRecord>();
const sessions = new Map<string, ChatSession>();

export const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function createChallenge(host: string): {
  nonce: string;
  message: string;
  expiresAt: number;
} {
  const nonce = generateNonce();
  const expiresAt = Date.now() + NONCE_TTL_MS;
  const message = `Sapience Chat — Sign to post.\n\nDomain: ${host}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
  nonces.set(nonce, { message, expiresAt, used: false });
  return { nonce, message, expiresAt };
}

export async function verifyAndCreateToken(params: {
  address: string;
  signature: string;
  nonce: string;
}): Promise<{ token: string; expiresAt: number } | null> {
  const record = nonces.get(params.nonce);
  if (!record) return null;
  if (record.used) return null;
  if (Date.now() > record.expiresAt) {
    nonces.delete(params.nonce);
    return null;
  }

  const ok = await verifyMessage({
    address: params.address as `0x${string}`,
    message: record.message,
    signature: params.signature as `0x${string}`,
  });
  if (!ok) return null;

  // Invalidate nonce
  record.used = true;
  nonces.set(params.nonce, record);

  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  sessions.set(token, { address: params.address.toLowerCase(), expiresAt });
  return { token, expiresAt };
}

export function validateToken(
  token: string | undefined | null
): ChatSession | null {
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return sess;
}

export function revokeToken(token: string) {
  sessions.delete(token);
}
