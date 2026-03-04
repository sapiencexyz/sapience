'use client';

import { useCallback, useState } from 'react';
import type { Address } from 'viem';
import { generateRandomNonce } from '@sapience/sdk';

/**
 * Hook to generate random nonces for the bitmap nonce system (Permit2-style).
 * No longer reads sequential nonces from the SecondaryMarketEscrow contract.
 * Each call to refetch() returns a fresh random nonce.
 */
export function useSecondaryNonce(_params: {
  address?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const [nonce, setNonce] = useState<bigint>(() => generateRandomNonce());

  const refetch = useCallback(() => {
    const freshNonce = generateRandomNonce();
    setNonce(freshNonce);
    return Promise.resolve({ data: freshNonce });
  }, []);

  return {
    nonce,
    isLoading: false,
    error: null,
    refetch,
  };
}
