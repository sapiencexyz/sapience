import type { Address } from 'viem';
import type { RecipientMode } from './types';

/**
 * Persisted record of a Bungee bridge we initiated. The required fields
 * are what we need to (a) re-poll status across page reloads and (b)
 * phrase the success toast in terms the user recognizes — Bungee's
 * `/bungee/status?requestHash=` endpoint stays the source of truth for
 * delivery status, tx hashes, and refund info.
 *
 * Optional context fields are display-only hints captured at submit
 * time so the in-progress row can immediately say "Bridging 100 USDC
 * from Base → Sapience Account" instead of waiting on the first status
 * poll. Treat them as best-effort: status data wins when it arrives.
 */
export interface BridgeRecord {
  requestHash: string;
  eoaAddress: Address;
  submittedAt: number;
  recipient: RecipientMode;
  sourceChainId?: number;
  sourceChainName?: string;
  sourceTokenSymbol?: string;
  sourceTokenDecimals?: number;
  /** Input amount as a wei string (decimals = sourceTokenDecimals). */
  inputAmount?: string;
  /** Resolved destination address at submit time. */
  destinationAddress?: Address;
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

function isBridgeRecord(value: unknown): value is BridgeRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.requestHash !== 'string') return false;
  if (typeof r.eoaAddress !== 'string') return false;
  if (typeof r.submittedAt !== 'number') return false;
  if (r.recipient !== 'smartAccount' && r.recipient !== 'eoa') return false;
  // Optional context — present-but-wrong-type rejects the whole record so we
  // never feed garbage into the in-progress row's display.
  if (r.sourceChainId !== undefined && typeof r.sourceChainId !== 'number') {
    return false;
  }
  if (
    r.sourceChainName !== undefined &&
    typeof r.sourceChainName !== 'string'
  ) {
    return false;
  }
  if (
    r.sourceTokenSymbol !== undefined &&
    typeof r.sourceTokenSymbol !== 'string'
  ) {
    return false;
  }
  if (
    r.sourceTokenDecimals !== undefined &&
    typeof r.sourceTokenDecimals !== 'number'
  ) {
    return false;
  }
  if (r.inputAmount !== undefined && typeof r.inputAmount !== 'string') {
    return false;
  }
  if (
    r.destinationAddress !== undefined &&
    typeof r.destinationAddress !== 'string'
  ) {
    return false;
  }
  return true;
}

function parseFromStorage(key: string): BridgeRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBridgeRecord);
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

/**
 * Cross-tab cache invalidator. Attached once at module load so the snapshot
 * cache stays correct even when no React component is currently subscribed
 * (e.g. another tab clears localStorage while this tab has the dialog
 * closed). Subscribe() just routes notifications; it doesn't gate cache
 * coherency.
 */
function handleStorageEvent(e: StorageEvent): void {
  if (e.key === null) {
    // localStorage.clear() in another tab.
    snapshotCache.clear();
    notify();
    return;
  }
  if (!e.key.startsWith(STORAGE_PREFIX)) return;
  snapshotCache.delete(e.key);
  notify();
}

if (isBrowser()) {
  window.addEventListener('storage', handleStorageEvent);
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
 * listener set) and on cross-tab writes (via the module-level `storage`
 * event handler, which always runs regardless of subscription state).
 */
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
