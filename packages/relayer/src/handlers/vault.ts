/**
 * Vault quote handler functions.
 *
 * Manages vault quote publishing, subscriptions, and observer feeds.
 * Uses ClientConnection/SubscriptionManager — no raw WebSocket.
 */

import { verifyMessage, type Abi } from 'viem';
import type { ClientConnection, SubscriptionManager } from '../transport/types';
import { getProviderForChain } from '../utils/getProviderForChain';
import {
  vaultQuotesPublished,
  errorsTotal,
  subscriptionsActive,
} from '../metrics';

// ============================================================================
// Types
// ============================================================================

export type VaultKey = string; // `${chainId}:${vaultAddressLower}`

export type PublishVaultQuotePayload = {
  chainId: number;
  vaultAddress: string;
  vaultCollateralPerShare: string;
  timestamp: number;
  signedBy: string;
  signature: string;
};

type SubscribePayload = { chainId: number; vaultAddress: string };

// ============================================================================
// State
// ============================================================================

const latestVaultQuoteByKey = new Map<VaultKey, PublishVaultQuotePayload>();

const SIGNER_CACHE_TTL_MS = 60_000;
const SIGNER_CACHE_MAX_SIZE = 500;
const vaultSignerCache = new Map<
  VaultKey,
  { signers: Set<string>; fetchedAt: number }
>();

// Periodically evict expired signer cache entries
const cacheEvictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of vaultSignerCache) {
    if (now - entry.fetchedAt > SIGNER_CACHE_TTL_MS) {
      vaultSignerCache.delete(key);
    }
  }
}, SIGNER_CACHE_TTL_MS);
cacheEvictionTimer.unref?.();

// ============================================================================
// Helpers
// ============================================================================

export function makeVaultKey(chainId: number, vaultAddress: string): VaultKey {
  return `${chainId}:${vaultAddress.toLowerCase()}`;
}

const PASSIVE_VAULT_ABI: Abi = [
  {
    type: 'function',
    name: 'manager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
];

async function fetchAuthorizedVaultSigners(
  chainId: number,
  vaultAddress: string
): Promise<Set<string>> {
  const client = getProviderForChain(chainId);
  const addr = vaultAddress.toLowerCase() as `0x${string}`;
  const manager = (await client
    .readContract({
      address: addr,
      abi: PASSIVE_VAULT_ABI,
      functionName: 'manager',
    })
    .catch(() => undefined)) as string | undefined;
  const set = new Set<string>();
  if (manager) set.add(manager.toLowerCase());
  return set;
}

function buildVaultCanonicalMessage(payload: PublishVaultQuotePayload): string {
  return [
    'Sapience Vault Share Quote',
    `Vault: ${payload.vaultAddress.toLowerCase()}`,
    `ChainId: ${payload.chainId}`,
    `CollateralPerShare: ${String(payload.vaultCollateralPerShare)}`,
    `Timestamp: ${payload.timestamp}`,
  ].join('\n');
}

function sendVaultAck(
  client: ClientConnection,
  payload: { ok?: boolean; error?: string }
): void {
  try {
    client.send({ type: 'vault_quote.ack', payload });
  } catch (err) {
    console.error('[Relayer] Failed to send vault_quote.ack:', err);
  }
}

// ============================================================================
// Handlers
// ============================================================================

export function handleVaultObserve(
  client: ClientConnection,
  subs: SubscriptionManager
): void {
  subs.subscribe('observers:vault', client);
  sendVaultAck(client, { ok: true });
}

export function handleVaultUnobserve(
  client: ClientConnection,
  subs: SubscriptionManager
): void {
  subs.unsubscribe('observers:vault', client);
  sendVaultAck(client, { ok: true });
}

export function handleVaultSubscribe(
  client: ClientConnection,
  payload: SubscribePayload | undefined,
  subs: SubscriptionManager
): void {
  const chainId = payload?.chainId;
  const vaultAddress = payload?.vaultAddress;
  if (!chainId || !vaultAddress) {
    sendVaultAck(client, { error: 'invalid_subscribe' });
    return;
  }

  const key = makeVaultKey(chainId, vaultAddress);
  const isNew = subs.subscribe(`vault:${key}`, client);
  if (isNew) subscriptionsActive.inc({ subscription_type: 'vault' });

  // Send latest cached quote if available
  const latest = latestVaultQuoteByKey.get(key);
  if (latest) {
    client.send({ type: 'vault_quote.update', payload: latest });
  }

  sendVaultAck(client, { ok: true });

  // Notify observers that a vault subscription was requested
  subs.broadcast('observers:vault', {
    type: 'vault_quote.requested',
    payload: {
      chainId,
      vaultAddress: vaultAddress.toLowerCase(),
      channel: key,
    },
  });
}

export function handleVaultUnsubscribe(
  client: ClientConnection,
  payload: SubscribePayload | undefined,
  subs: SubscriptionManager
): void {
  const chainId = payload?.chainId;
  const vaultAddress = payload?.vaultAddress;
  if (!chainId || !vaultAddress) {
    console.warn(
      '[Relayer] vault unsubscribe rejected: missing chainId or vaultAddress'
    );
    sendVaultAck(client, { error: 'invalid_unsubscribe' });
    return;
  }

  const key = makeVaultKey(chainId, vaultAddress);
  const wasRemoved = subs.unsubscribe(`vault:${key}`, client);
  if (wasRemoved) subscriptionsActive.dec({ subscription_type: 'vault' });
  sendVaultAck(client, { ok: true });
}

export async function handleVaultQuotePublish(
  client: ClientConnection,
  payload: PublishVaultQuotePayload | undefined,
  subs: SubscriptionManager
): Promise<void> {
  try {
    if (
      !payload ||
      !payload.vaultAddress ||
      !payload.chainId ||
      payload.timestamp == null ||
      payload.vaultCollateralPerShare == null ||
      !payload.signedBy ||
      !payload.signature
    ) {
      vaultQuotesPublished.inc({ status: 'error' });
      errorsTotal.inc({
        type: 'validation',
        message_type: 'vault_quote.publish',
      });
      sendVaultAck(client, { error: 'invalid_payload' });
      return;
    }

    // Anti-replay window (5 minutes)
    if (Math.abs(Date.now() - payload.timestamp) > 5 * 60 * 1000) {
      vaultQuotesPublished.inc({ status: 'error' });
      errorsTotal.inc({
        type: 'validation',
        message_type: 'vault_quote.publish',
      });
      sendVaultAck(client, { error: 'stale_timestamp' });
      return;
    }

    const key = makeVaultKey(payload.chainId, payload.vaultAddress);

    // Check authorized signers (with cache)
    let allowed = vaultSignerCache.get(key);
    const cacheFresh =
      allowed && Date.now() - allowed.fetchedAt < SIGNER_CACHE_TTL_MS;
    if (!cacheFresh) {
      const signers = await fetchAuthorizedVaultSigners(
        payload.chainId,
        payload.vaultAddress
      );
      allowed = { signers, fetchedAt: Date.now() };
      if (
        vaultSignerCache.size >= SIGNER_CACHE_MAX_SIZE &&
        !vaultSignerCache.has(key)
      ) {
        const oldestKey = vaultSignerCache.keys().next().value;
        if (oldestKey) vaultSignerCache.delete(oldestKey);
      }
      vaultSignerCache.set(key, allowed);
    }

    // Verify signature
    const canonical = buildVaultCanonicalMessage(payload);
    const ok = await verifyMessage({
      address: payload.signedBy.toLowerCase() as `0x${string}`,
      message: canonical,
      signature: payload.signature as `0x${string}`,
    });
    if (!ok) {
      sendVaultAck(client, { error: 'bad_signature' });
      return;
    }

    // Check authorization
    if (!allowed!.signers.has(payload.signedBy.toLowerCase())) {
      vaultQuotesPublished.inc({ status: 'unauthorized' });
      errorsTotal.inc({
        type: 'authorization',
        message_type: 'vault_quote.publish',
      });
      sendVaultAck(client, { error: 'unauthorized_signer' });
      return;
    }

    // Normalize and store
    const normalized: PublishVaultQuotePayload = {
      chainId: payload.chainId,
      vaultAddress: payload.vaultAddress.toLowerCase(),
      vaultCollateralPerShare: String(payload.vaultCollateralPerShare),
      timestamp: payload.timestamp,
      signedBy: payload.signedBy.toLowerCase(),
      signature: payload.signature,
    };
    latestVaultQuoteByKey.set(key, normalized);

    vaultQuotesPublished.inc({ status: 'success' });

    // Broadcast to vault subscribers
    subs.broadcast(`vault:${key}`, {
      type: 'vault_quote.update',
      payload: normalized,
    });

    sendVaultAck(client, { ok: true });

    // Broadcast to observers
    subs.broadcast('observers:vault', {
      type: 'vault_quote.update',
      payload: normalized,
    });
  } catch (err) {
    vaultQuotesPublished.inc({ status: 'error' });
    errorsTotal.inc({
      type: 'internal_error',
      message_type: 'vault_quote.publish',
    });
    sendVaultAck(client, {
      error: (err as Error).message || 'internal_error',
    });
  }
}

/**
 * Clear vault state (for testing).
 */
export function clearVaultState(): void {
  latestVaultQuoteByKey.clear();
  vaultSignerCache.clear();
}
