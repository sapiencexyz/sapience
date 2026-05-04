import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import {
  addBridge,
  getBridges,
  pruneStale,
  removeBridge,
  subscribe,
  type BridgeRecord,
} from '~/lib/bungee/bridgeTracker';

const EOA: Address = '0x0000000000000000000000000000000000000001';
const STORAGE_KEY = `sapience:bungee-bridges:${EOA.toLowerCase()}`;

const makeRec = (over: Partial<BridgeRecord> = {}): BridgeRecord => ({
  requestHash: '0xhash1',
  eoaAddress: EOA,
  submittedAt: Date.now(),
  recipient: 'smartAccount',
  ...over,
});

// Tests reset both localStorage and the tracker's in-memory snapshot cache.
// The cache is invalidated by `storage` events with `key === null` (matching
// the cross-tab `localStorage.clear()` behaviour), so we dispatch a synthetic
// one to mirror it.
function resetTracker() {
  window.localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
}

describe('bungee/bridgeTracker', () => {
  beforeEach(() => {
    resetTracker();
  });
  afterEach(() => {
    resetTracker();
    vi.useRealTimers();
  });

  it('returns empty when nothing persisted', () => {
    expect(getBridges(EOA)).toEqual([]);
  });

  it('addBridge persists and surfaces a new record', () => {
    const rec = makeRec();
    addBridge(rec);
    expect(getBridges(EOA)).toEqual([rec]);
    // Round-trip through localStorage too.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
  });

  it('addBridge dedupes by requestHash', () => {
    addBridge(makeRec({ requestHash: '0xhash1' }));
    addBridge(
      makeRec({ requestHash: '0xhash1', recipient: 'eoa', submittedAt: 999 })
    );
    const stored = getBridges(EOA);
    expect(stored).toHaveLength(1);
    // First-wins, so the second add was a no-op.
    expect(stored[0].recipient).toBe('smartAccount');
  });

  it('removeBridge filters by hash', () => {
    addBridge(makeRec({ requestHash: '0xhash1' }));
    addBridge(makeRec({ requestHash: '0xhash2' }));
    removeBridge('0xhash1', EOA);
    expect(getBridges(EOA).map((r) => r.requestHash)).toEqual(['0xhash2']);
  });

  it('removeBridge for unknown hash is a no-op', () => {
    addBridge(makeRec({ requestHash: '0xhash1' }));
    removeBridge('0xnope', EOA);
    expect(getBridges(EOA)).toHaveLength(1);
  });

  it('snapshots are reference-stable until mutation', () => {
    addBridge(makeRec());
    const a = getBridges(EOA);
    const b = getBridges(EOA);
    expect(a).toBe(b);
    addBridge(makeRec({ requestHash: '0xhash2' }));
    const c = getBridges(EOA);
    expect(c).not.toBe(a);
  });

  it('pruneStale drops records older than 24h', () => {
    const now = Date.now();
    addBridge(makeRec({ requestHash: '0xnew', submittedAt: now }));
    addBridge(
      makeRec({
        requestHash: '0xold',
        submittedAt: now - 25 * 60 * 60 * 1000,
      })
    );
    pruneStale(EOA);
    expect(getBridges(EOA).map((r) => r.requestHash)).toEqual(['0xnew']);
  });

  it('rejects malformed records on read', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          requestHash: '0xok',
          eoaAddress: EOA,
          submittedAt: 1,
          recipient: 'eoa',
        },
        { not: 'a record' },
        null,
        {
          requestHash: 'bad-recipient',
          eoaAddress: EOA,
          submittedAt: 1,
          recipient: 'mars',
        },
      ])
    );
    const out = getBridges(EOA);
    expect(out.map((r) => r.requestHash)).toEqual(['0xok']);
  });

  it('returns [] when storage payload is not JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, 'definitely not json');
    expect(getBridges(EOA)).toEqual([]);
  });

  it('subscribe fires on writes and unsubscribe stops them', () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    addBridge(makeRec());
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    addBridge(makeRec({ requestHash: '0xhash2' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cross-tab storage event invalidates the snapshot cache', () => {
    addBridge(makeRec({ requestHash: '0xfromtab1' }));
    const before = getBridges(EOA);
    expect(before.map((r) => r.requestHash)).toEqual(['0xfromtab1']);

    // Mutate the underlying storage as another tab would, then dispatch the
    // synthetic event the browser would normally fire on cross-tab writes.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          requestHash: '0xfromtab2',
          eoaAddress: EOA,
          submittedAt: 1,
          recipient: 'eoa',
        },
      ])
    );
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

    const after = getBridges(EOA);
    expect(after.map((r) => r.requestHash)).toEqual(['0xfromtab2']);
  });

  it('null storage key (clear()) drops the cache for all EOAs', () => {
    addBridge(makeRec());
    expect(getBridges(EOA)).toHaveLength(1);

    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));

    expect(getBridges(EOA)).toEqual([]);
  });
});
