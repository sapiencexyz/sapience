'use client';

import { useAccount } from 'wagmi';
import { useMemo } from 'react';
import { useAuth } from '~/lib/context/AuthContext';

interface ConnectedWalletState {
  ready: boolean;
  connectedWallet: { address: `0x${string}` } | undefined;
  hasConnectedWallet: boolean;
}

/**
 * Unified hook to detect wallet connection from wagmi.
 * Respects explicit logout state for wallets that don't support programmatic disconnect.
 */
export function useConnectedWallet(): ConnectedWalletState {
  const { address, isConnected, status } = useAccount();
  const { isLoggedOut } = useAuth();

  const ready = status !== 'connecting' && status !== 'reconnecting';

  const connectedWallet = useMemo(() => {
    // If user explicitly logged out, don't show any wallet
    if (isLoggedOut) {
      return undefined;
    }
    if (isConnected && address) {
      return { address };
    }
    return undefined;
  }, [isConnected, address, isLoggedOut]);

  const hasConnectedWallet = Boolean(ready && connectedWallet?.address);

  return { ready, connectedWallet, hasConnectedWallet };
}
