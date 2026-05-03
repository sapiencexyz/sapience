import type { Address } from 'viem';

/**
 * Persisted record of a Bungee bridge we initiated. We deliberately keep
 * this minimal — Bungee's `/bungee/status?requestHash=` endpoint is the
 * source of truth for status, source/destination tx hashes, refund info,
 * etc. We just need enough here to (a) re-poll status across page reloads
 * and (b) phrase the success toast in terms the user recognizes.
 */
export interface BridgeRecord {
  requestHash: string;
  eoaAddress: Address;
  submittedAt: number;
  recipient: 'smartAccount' | 'eoa';
}

const STORAGE_PREFIX = 'sapience:bungee-bridges:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function storageKey(eoa: Address): string {
  return `${STORAGE_PREFIX}${eoa.toLowerCase()}`;
}

function readRaw(eoa: Address): BridgeRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(eoa));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is BridgeRecord =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as BridgeRecord).requestHash === 'string' &&
        typeof (r as BridgeRecord).eoaAddress === 'string' &&
        typeof (r as BridgeRecord).submittedAt === 'number' &&
        ((r as BridgeRecord).recipient === 'smartAccount' ||
          (r as BridgeRecord).recipient === 'eoa')
    );
  } catch {
    return [];
  }
}

function writeRaw(eoa: Address, records: BridgeRecord[]): void {
  if (!isBrowser()) return;
  try {
    if (records.length === 0) {
      window.localStorage.removeItem(storageKey(eoa));
    } else {
      window.localStorage.setItem(storageKey(eoa), JSON.stringify(records));
    }
  } catch {
    // ignore quota / serialization failures
  }
  notify();
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function getBridges(eoa: Address): BridgeRecord[] {
  return readRaw(eoa);
}

export function addBridge(rec: BridgeRecord): void {
  const existing = readRaw(rec.eoaAddress);
  if (existing.some((r) => r.requestHash === rec.requestHash)) return;
  writeRaw(rec.eoaAddress, [...existing, rec]);
}

export function removeBridge(hash: string, eoa: Address): void {
  const existing = readRaw(eoa);
  const next = existing.filter((r) => r.requestHash !== hash);
  if (next.length === existing.length) return;
  writeRaw(eoa, next);
}

/**
 * Drops records older than MAX_AGE_MS. Bungee's status endpoint stops
 * returning entries for hashes older than that window, so leaving them in
 * storage just produces noisy 4xx polls.
 */
export function pruneStale(eoa: Address): void {
  const existing = readRaw(eoa);
  const cutoff = Date.now() - MAX_AGE_MS;
  const next = existing.filter((r) => r.submittedAt >= cutoff);
  if (next.length === existing.length) return;
  writeRaw(eoa, next);
}

/**
 * Subscribe to changes. Fires on same-tab writes (via the in-memory
 * listener set) and on cross-tab writes (via the `storage` event).
 */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  let storageHandler: ((e: StorageEvent) => void) | null = null;
  if (isBrowser()) {
    storageHandler = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(STORAGE_PREFIX)) cb();
    };
    window.addEventListener('storage', storageHandler);
  }
  return () => {
    listeners.delete(cb);
    if (storageHandler) window.removeEventListener('storage', storageHandler);
  };
}
