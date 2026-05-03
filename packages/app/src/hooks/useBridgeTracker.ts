'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAccount } from 'wagmi';
import {
  addBridge,
  getBridges,
  removeBridge,
  subscribe,
  type BridgeRecord,
} from '~/lib/bridgeTracker';

const EMPTY: BridgeRecord[] = [];

/**
 * React hook over the Bungee bridge tracker, scoped to the connected EOA.
 * Returns the live list of persisted bridges and helpers to add/remove.
 * Uses useSyncExternalStore so SSR and same-tab updates stay consistent.
 */
export function useBridgeTracker() {
  const { address } = useAccount();

  const getSnapshot = useCallback(
    () => (address ? getBridges(address) : EMPTY),
    [address]
  );

  const bridges = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const add = useCallback(
    (requestHash: string, recipient: 'smartAccount' | 'eoa') => {
      if (!address) return;
      addBridge({
        requestHash,
        eoaAddress: address,
        submittedAt: Date.now(),
        recipient,
      });
    },
    [address]
  );

  const remove = useCallback(
    (requestHash: string) => {
      if (!address) return;
      removeBridge(requestHash, address);
    },
    [address]
  );

  return { bridges, addBridge: add, removeBridge: remove };
}
