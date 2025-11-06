import { useEffect, useState } from 'react';
import { CHAIN_ID_ARBITRUM } from '~/components/admin/constants';

/**
 * Hook to read chainId from localStorage with support for:
 * - Avoiding hydration errors by reading in useEffect
 * - Monitoring changes across tabs/windows via storage events
 * - Monitoring changes in the same tab via custom events
 *
 * @returns The current chainId from localStorage, defaults to CHAIN_ID_ARBITRUM
 */
export const useChainIdFromLocalStorage = (): number => {
  const [chainId, setChainId] = useState<number>(CHAIN_ID_ARBITRUM);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial read from localStorage
    const readChainId = () => {
      try {
        const stored = window.localStorage.getItem('sapience.settings.chainId');
        const parsedChainId = stored ? parseInt(stored, 10) : CHAIN_ID_ARBITRUM;
        setChainId(parsedChainId);
      } catch {
        setChainId(CHAIN_ID_ARBITRUM);
      }
    };

    readChainId();

    // Listen for storage changes (from other tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sapience.settings.chainId') {
        readChainId();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom events (for changes in the same tab)
    const handleCustomStorageChange = () => {
      readChainId();
    };

    window.addEventListener(
      'localStorageChange',
      handleCustomStorageChange as EventListener
    );

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(
        'localStorageChange',
        handleCustomStorageChange as EventListener
      );
    };
  }, []);

  return chainId;
};
