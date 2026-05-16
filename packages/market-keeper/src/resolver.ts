import {
  manualConditionResolver,
  conditionalTokensConditionResolver,
} from '@sapience/sdk';
import type { Address } from 'viem';

export type ResolverType = 'ct' | 'manual';

interface ResolverConfig {
  /** Checksummed resolver address for creating new conditions */
  address: Address;
  /** All resolver addresses (current + legacy), lowercased for DB matching */
  allAddresses: string[];
}

/** Normalize a legacy entry that may be a bare address string or { address, blockCreated }. */
function normalizeLegacy(entry: string | { address: string }): string {
  return typeof entry === 'string' ? entry : entry.address;
}

type LegacyResolverEntry = string | { address: string };

type ResolverMap = Record<
  number,
  { address: Address; legacy?: readonly LegacyResolverEntry[] }
>;

const RESOLVER_MAPS: Record<ResolverType, ResolverMap> = {
  ct: conditionalTokensConditionResolver,
  manual: manualConditionResolver,
};

const RESOLVER_LABELS: Record<ResolverType, string> = {
  ct: 'ConditionalTokensConditionResolver',
  manual: 'ManualConditionResolver',
};

/**
 * Get resolver configuration for a given chain and resolver type.
 *
 * @param chainId - Target chain ID
 * @param resolverType - Which resolver to use: 'ct' (LZ bridge) or 'manual' (direct settlement)
 * @returns Resolver address and full address list (current + legacy) for DB queries
 * @throws If the resolver type has no entry for the given chain
 */
export function getResolverConfig(
  chainId: number,
  resolverType: ResolverType
): ResolverConfig {
  const map = RESOLVER_MAPS[resolverType];
  const entry = map[chainId];

  if (!entry) {
    throw new Error(
      `${RESOLVER_LABELS[resolverType]} has no deployment on chain ${chainId}. ` +
        `Set RESOLVER_TYPE to a resolver that exists on this chain.`
    );
  }

  const addrs: string[] = [entry.address];
  if (entry.legacy) {
    for (const leg of entry.legacy) {
      addrs.push(normalizeLegacy(leg));
    }
  }

  return {
    address: entry.address,
    allAddresses: [...new Set(addrs.map((a) => a.toLowerCase()))],
  };
}
