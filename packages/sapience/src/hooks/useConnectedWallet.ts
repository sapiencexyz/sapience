'use client';

import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useMemo } from 'react';

export interface ConnectedWalletState {
  ready: boolean;
  connectedWallet: ReturnType<typeof useWallets>['wallets'][number] | undefined;
  hasConnectedWallet: boolean;
}

export function useConnectedWallet(): ConnectedWalletState {
  const { wallets } = useWallets();
  const { ready } = usePrivy();

  const connectedWallet = useMemo(() => wallets?.[0], [wallets]);
  const hasConnectedWallet = Boolean(ready && connectedWallet?.address);

  return { ready, connectedWallet, hasConnectedWallet };
}
