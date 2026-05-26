'use client';

import { useBalance } from 'wagmi';
import type { Address } from 'viem';
import { BUNGEE_SOURCE_CHAIN_IDS } from '~/lib/bungee/sources';

interface NativeBalancesResult {
  /** Map of source chain id → native balance in wei (defaults to 0n). */
  byChainId: Record<number, bigint>;
  /** True while any underlying useBalance is in flight. */
  isLoading: boolean;
}

/**
 * Read the connected wallet's native (gas-token) balance on every Bungee
 * source chain in one hook. The iteration is over a module-level constant so
 * the hook count stays stable across renders — adding a chain is one entry
 * in `BUNGEE_SOURCE_CHAIN_IDS` (and a matching wagmi transport).
 */
export function useBungeeNativeBalances(
  eoaAddress: Address | undefined
): NativeBalancesResult {
  const ethereum = useBalance({
    chainId: 1,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const arbitrum = useBalance({
    chainId: 42161,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const base = useBalance({
    chainId: 8453,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const bnb = useBalance({
    chainId: 56,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });
  const hyperEvm = useBalance({
    chainId: 999,
    address: eoaAddress,
    query: { enabled: !!eoaAddress },
  });

  const queries = [ethereum, arbitrum, base, bnb, hyperEvm];

  const byChainId: Record<number, bigint> = {};
  let isLoading = false;
  for (let i = 0; i < BUNGEE_SOURCE_CHAIN_IDS.length; i++) {
    const chainId = BUNGEE_SOURCE_CHAIN_IDS[i];
    const q = queries[i];
    byChainId[chainId] = q.data?.value ?? 0n;
    if (q.isLoading) isLoading = true;
  }

  return { byChainId, isLoading };
}
