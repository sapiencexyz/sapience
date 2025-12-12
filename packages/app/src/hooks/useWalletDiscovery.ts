'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * EIP-6963 Provider Info
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

/**
 * EIP-6963 Provider Detail (includes the actual provider)
 */
export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: unknown;
}

/**
 * EIP-6963 Announce Provider Event
 */
interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

/**
 * Hook to discover wallets via EIP-6963
 * Returns a list of discovered wallet providers that can be used for connection
 */
export function useWalletDiscovery() {
  const [discoveredWallets, setDiscoveredWallets] = useState<
    EIP6963ProviderDetail[]
  >([]);
  const [isDiscovering, setIsDiscovering] = useState(true);

  const handleAnnouncement = useCallback(
    (event: EIP6963AnnounceProviderEvent) => {
      const { detail } = event;
      if (!detail?.info?.uuid) return;

      setDiscoveredWallets((prev) => {
        // Avoid duplicates by checking uuid
        if (prev.some((w) => w.info.uuid === detail.info.uuid)) {
          return prev;
        }
        return [...prev, detail];
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Listen for wallet announcements
    window.addEventListener(
      'eip6963:announceProvider',
      handleAnnouncement as EventListener
    );

    // Request wallets to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Give wallets time to respond, then mark discovery as complete
    const timeout = setTimeout(() => {
      setIsDiscovering(false);
    }, 500);

    return () => {
      window.removeEventListener(
        'eip6963:announceProvider',
        handleAnnouncement as EventListener
      );
      clearTimeout(timeout);
    };
  }, [handleAnnouncement]);

  return {
    discoveredWallets,
    isDiscovering,
  };
}
