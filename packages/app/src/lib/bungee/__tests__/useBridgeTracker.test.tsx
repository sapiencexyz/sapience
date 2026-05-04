import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

const EOA: Address = '0x0000000000000000000000000000000000000001';

let mockAddress: Address | undefined = EOA;

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: mockAddress }),
}));

import { useBridgeTracker } from '~/lib/bungee/useBridgeTracker';
import { addBridge } from '~/lib/bungee/bridgeTracker';

// Reset both localStorage and the tracker's in-memory snapshot cache.
// The cache is invalidated by `storage` events with `key === null` (matching
// the cross-tab `localStorage.clear()` behaviour), so we dispatch a synthetic
// one to mirror it. Without this, dedup-by-requestHash inside addBridge sees
// stale cached records and silently drops the second add.
function resetTracker() {
  window.localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
}

describe('useBridgeTracker', () => {
  beforeEach(() => {
    mockAddress = EOA;
    resetTracker();
  });
  afterEach(() => {
    resetTracker();
  });

  it('returns the live list scoped to the connected EOA', () => {
    const { result } = renderHook(() => useBridgeTracker());
    expect(result.current.bridges).toEqual([]);

    act(() => {
      result.current.addBridge('0xabc', 'smartAccount');
    });

    expect(result.current.bridges).toHaveLength(1);
    expect(result.current.bridges[0]).toMatchObject({
      requestHash: '0xabc',
      eoaAddress: EOA,
      recipient: 'smartAccount',
    });
  });

  it('forwards optional context fields when provided', () => {
    const { result } = renderHook(() => useBridgeTracker());
    act(() => {
      result.current.addBridge('0xabc', 'eoa', {
        sourceChainId: 8453,
        sourceChainName: 'Base',
        sourceTokenSymbol: 'USDC',
        sourceTokenDecimals: 6,
        inputAmount: '100000000',
        destinationAddress: EOA,
      });
    });
    expect(result.current.bridges[0]).toMatchObject({
      requestHash: '0xabc',
      sourceChainId: 8453,
      sourceTokenSymbol: 'USDC',
      destinationAddress: EOA,
    });
  });

  it('removeBridge removes by hash', () => {
    const { result } = renderHook(() => useBridgeTracker());
    act(() => {
      result.current.addBridge('0xabc', 'smartAccount');
      result.current.addBridge('0xdef', 'eoa');
    });
    act(() => {
      result.current.removeBridge('0xabc');
    });
    expect(result.current.bridges.map((b) => b.requestHash)).toEqual(['0xdef']);
  });

  it('snapshot reference is stable across re-renders without mutation', () => {
    addBridge({
      requestHash: '0xabc',
      eoaAddress: EOA,
      submittedAt: 1,
      recipient: 'smartAccount',
    });
    const { result, rerender } = renderHook(() => useBridgeTracker());
    const a = result.current.bridges;
    rerender();
    const b = result.current.bridges;
    expect(a).toBe(b);
  });

  it('returns an empty list when no address is connected', () => {
    mockAddress = undefined;
    const { result } = renderHook(() => useBridgeTracker());
    expect(result.current.bridges).toEqual([]);
    // addBridge is a no-op when disconnected — must not throw.
    act(() => result.current.addBridge('0xabc', 'eoa'));
    expect(result.current.bridges).toEqual([]);
  });
});
