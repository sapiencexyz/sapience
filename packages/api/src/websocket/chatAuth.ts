import {
  verifyMessage,
  recoverMessageAddress,
  type Address,
  type Hex,
} from 'viem';
import crypto from 'crypto';
import {
  verifySessionApproval,
  type EnableTypedData,
  type SessionApprovalPayload,
} from '@sapience/sdk/session';

export type ChatSession = { address: string; expiresAt: number };
export type NonceRecord = { message: string; expiresAt: number; used: boolean };

// In-memory stores; fine for single-instance deployments. For multi-instance, move to Redis.
const nonces = new Map<string, NonceRecord>();
const sessions = new Map<string, ChatSession>();

export const NONCE_TTL_MS = (() => {
  const raw = process.env.CHAT_NONCE_TTL_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000; // default 5m
})();
export const TOKEN_TTL_MS = (() => {
  const raw = process.env.CHAT_TOKEN_TTL_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60 * 1000; // default 15m
})();
export const MAX_NONCES = 5000;
export const MAX_SESSIONS = 10000;

function enforceCap<K, V>(map: Map<K, V>, maxSize: number) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value as K | undefined;
    if (firstKey === undefined) break;
    map.delete(firstKey);
  }
}

function periodicCleanup() {
  const now = Date.now();
  // Clean nonces: remove expired or used ones
  for (const [nonce, rec] of nonces) {
    if (rec.used || now > rec.expiresAt) {
      nonces.delete(nonce);
    }
  }
  // Clean sessions: remove expired
  for (const [token, sess] of sessions) {
    if (now > sess.expiresAt) {
      sessions.delete(token);
    }
  }
  // Enforce hard caps
  enforceCap(nonces, MAX_NONCES);
  enforceCap(sessions, MAX_SESSIONS);
}

// Run cleanup every minute
setInterval(periodicCleanup, 60 * 1000).unref?.();

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
  enforceCap(nonces, MAX_NONCES);
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
  enforceCap(sessions, MAX_SESSIONS);
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

export function refreshToken(
  oldToken: string
): { token: string; expiresAt: number; address: string } | null {
  const sess = validateToken(oldToken);
  if (!sess) return null;
  // rotate token
  sessions.delete(oldToken);
  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  sessions.set(token, { address: sess.address, expiresAt });
  enforceCap(sessions, MAX_SESSIONS);
  return { token, expiresAt, address: sess.address };
}

/**
 * Verifies a session approval and challenge signature, then creates a chat token.
 *
 * This allows users with an active ZeroDev session to authenticate to chat
 * using their session key instead of signing with their wallet again.
 *
 * Security model:
 * 1. Verify the session approval to confirm the smart account and extract the session key
 * 2. Verify the challenge signature was signed by the extracted session key
 * 3. If both pass, create a chat token for the smart account address
 *
 * @param params - Session authentication parameters
 * @returns Chat token and expiry, or null if verification fails
 */
export async function verifySessionAndCreateToken(params: {
  sessionApproval: string;
  sessionTypedData: EnableTypedData;
  sessionSignature: string;
  nonce: string;
  chainId: number;
}): Promise<{ token: string; expiresAt: number; address: string } | null> {
  // Validate nonce exists and is unused
  const record = nonces.get(params.nonce);
  if (!record) {
    console.warn('[ChatAuth] Session auth failed: nonce not found');
    return null;
  }
  if (record.used) {
    console.warn('[ChatAuth] Session auth failed: nonce already used');
    return null;
  }
  if (Date.now() > record.expiresAt) {
    nonces.delete(params.nonce);
    console.warn('[ChatAuth] Session auth failed: nonce expired');
    return null;
  }

  // Build session approval payload
  const approvalPayload: SessionApprovalPayload = {
    approval: params.sessionApproval,
    chainId: params.chainId,
    typedData: params.sessionTypedData,
  };

  // Extract claimed account address from typed data
  const claimedAccountAddress = params.sessionTypedData.domain
    .verifyingContract as Address;

  // Verify the session approval
  const sessionResult = await verifySessionApproval(
    approvalPayload,
    claimedAccountAddress
  );

  if (!sessionResult.valid || !sessionResult.sessionKeyAddress) {
    console.warn(
      '[ChatAuth] Session approval verification failed:',
      sessionResult.error
    );
    return null;
  }

  // Verify the challenge was signed by the session key
  try {
    const recoveredSigner = await recoverMessageAddress({
      message: record.message,
      signature: params.sessionSignature as Hex,
    });

    if (
      recoveredSigner.toLowerCase() !==
      sessionResult.sessionKeyAddress.toLowerCase()
    ) {
      console.warn('[ChatAuth] Challenge signature not from session key:', {
        expected: sessionResult.sessionKeyAddress,
        recovered: recoveredSigner,
      });
      return null;
    }
  } catch (error) {
    console.error('[ChatAuth] Failed to verify challenge signature:', error);
    return null;
  }

  // Invalidate nonce
  record.used = true;
  nonces.set(params.nonce, record);

  // Create chat token for the smart account address
  const address = claimedAccountAddress.toLowerCase();
  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  sessions.set(token, { address, expiresAt });
  enforceCap(sessions, MAX_SESSIONS);

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[ChatAuth] Session auth successful for:', address);
  }

  return { token, expiresAt, address };
}
