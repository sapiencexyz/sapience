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

// Cached array per storage key. `useSyncExternalStore` calls getSnapshot on
// every check and compares by reference — if we re-parsed localStorage each
// time we'd return a fresh array every call and trigger an infinite render
// loop. Cache invalidates on internal writes (writeRaw) and cross-tab
// `storage` events (subscribe).
const snapshotCache = new Map<string, BridgeRecord[]>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function storageKey(eoa: Address): string {
  return `${STORAGE_PREFIX}${eoa.toLowerCase()}`;
}

function parseFromStorage(key: string): BridgeRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
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

function readRaw(eoa: Address): BridgeRecord[] {
  const key = storageKey(eoa);
  const cached = snapshotCache.get(key);
  if (cached !== undefined) return cached;
  const fresh = parseFromStorage(key);
  snapshotCache.set(key, fresh);
  return fresh;
}

function writeRaw(eoa: Address, records: BridgeRecord[]): void {
  const key = storageKey(eoa);
  if (isBrowser()) {
    try {
      if (records.length === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(records));
      }
    } catch {
      // ignore quota / serialization failures
    }
  }
  // Update cache to the new array identity so subsequent getSnapshot calls
  // return the same reference until the next mutation.
  snapshotCache.set(key, records);
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
      // null key means localStorage.clear() — drop everything we cached.
      if (e.key === null) {
        snapshotCache.clear();
        cb();
        return;
      }
      if (!e.key.startsWith(STORAGE_PREFIX)) return;
      // Another tab mutated this key — drop the cached array so the next
      // read pulls fresh from localStorage.
      snapshotCache.delete(e.key);
      cb();
    };
    window.addEventListener('storage', storageHandler);
  }
  return () => {
    listeners.delete(cb);
    if (storageHandler) window.removeEventListener('storage', storageHandler);
  };
}
