'use client';

import { useState, useCallback, useMemo } from 'react';
import { useConnect, useConfig } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import type { EIP6963ProviderDetail } from './useWalletDiscovery';

type ConnectingWallet = string | null;

/**
 * Hook for connecting to external wallets
 * Supports EIP-6963 discovered wallets, Coinbase, and OKX
 */
export function useExternalWalletConnect() {
  const { connectAsync } = useConnect();
  const config = useConfig();
  const [connectingWallet, setConnectingWallet] =
    useState<ConnectingWallet>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnecting = connectingWallet !== null;

  // Get chain ID from config
  const chainId = useMemo(() => {
    return config.chains[0]?.id;
  }, [config.chains]);

  /**
   * Connect to an EIP-6963 discovered wallet
   */
  const connectEIP6963Wallet = useCallback(
    async (wallet: EIP6963ProviderDetail) => {
      setConnectingWallet(wallet.info.rdns);
      setError(null);

      try {
        // Create an injected connector with the specific provider
        const connector = injected({
          target: () => ({
            id: wallet.info.rdns,
            name: wallet.info.name,
            provider: wallet.provider as never,
          }),
        });

        await connectAsync({ connector, chainId });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        console.error('[ExternalWalletConnect] EIP-6963 connection failed:', err);
      } finally {
        setConnectingWallet(null);
      }
    },
    [connectAsync, chainId]
  );

  /**
   * Connect via Coinbase Wallet
   */
  const connectCoinbaseWallet = useCallback(async () => {
    setConnectingWallet('coinbase');
    setError(null);

    try {
      const connector = coinbaseWallet({
        appName: 'Sapience',
      });

      await connectAsync({ connector, chainId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      console.error('[ExternalWalletConnect] Coinbase Wallet failed:', err);
    } finally {
      setConnectingWallet(null);
    }
  }, [connectAsync, chainId]);

  /**
   * Connect via OKX Wallet
   * Uses injected connector targeting OKX's provider
   */
  const connectOKXWallet = useCallback(async () => {
    setConnectingWallet('okx');
    setError(null);

    try {
      // Check if OKX wallet is available
      const okxProvider =
        typeof window !== 'undefined'
          ? (window as unknown as { okxwallet?: unknown }).okxwallet
          : undefined;

      if (!okxProvider) {
        // Open OKX wallet download page if not installed
        window.open('https://www.okx.com/web3', '_blank');
        setConnectingWallet(null);
        return;
      }

      const connector = injected({
        target: () => ({
          id: 'okx',
          name: 'OKX Wallet',
          provider: okxProvider as never,
        }),
      });

      await connectAsync({ connector, chainId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
      console.error('[ExternalWalletConnect] OKX Wallet failed:', err);
    } finally {
      setConnectingWallet(null);
    }
  }, [connectAsync, chainId]);

  return {
    connectingWallet,
    isConnecting,
    error,
    connectEIP6963Wallet,
    connectCoinbaseWallet,
    connectOKXWallet,
  };
}
