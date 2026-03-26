import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  pythConditionResolver,
  conditionalTokensConditionResolver,
  manualConditionResolver,
} from '@sapience/sdk/contracts/addresses';

type Address = `0x${string}`;

function normalizeAddress(addr?: string | null): string | null {
  if (!addr) return null;
  const s = String(addr).trim();
  if (!s.startsWith('0x')) return null;
  return s.toLowerCase();
}

function findChainIdForAddress(
  addr: string | null,
  map: Record<number, { address: Address }>
): number | null {
  if (!addr) return null;
  for (const [k, v] of Object.entries(map)) {
    if (normalizeAddress(v?.address) === addr) return Number(k);
  }
  return null;
}

export type ResolverKind = 'pyth' | 'conditionalTokens' | 'manual' | 'unknown';

export function inferResolverKind(
  resolverAddress?: string | null
): ResolverKind {
  const addr = normalizeAddress(resolverAddress);
  if (!addr) return 'unknown';
  if (findChainIdForAddress(addr, pythConditionResolver) != null) return 'pyth';
  if (findChainIdForAddress(addr, conditionalTokensConditionResolver) != null)
    return 'conditionalTokens';
  if (findChainIdForAddress(addr, manualConditionResolver) != null)
    return 'manual';
  return 'unknown';
}

/**
 * For general app flows, we default to Ethereal unless the resolver address itself
 * clearly indicates another chain.
 */
export function inferChainIdFromResolverAddress(
  resolverAddress?: string | null
): number {
  const addr = normalizeAddress(resolverAddress);
  if (!addr) return DEFAULT_CHAIN_ID;

  const pythCondChain = findChainIdForAddress(addr, pythConditionResolver);
  if (pythCondChain != null) return pythCondChain;

  const ctChain = findChainIdForAddress(
    addr,
    conditionalTokensConditionResolver
  );
  if (ctChain != null) return ctChain;

  return DEFAULT_CHAIN_ID;
}
