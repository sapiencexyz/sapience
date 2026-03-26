/**
 * Build a lookup from resolver address → resolver type using SDK address maps.
 * Includes current + legacy addresses for both CT and Pyth resolvers.
 */

import type { Address } from 'viem';
import {
  conditionalTokensConditionResolver,
  pythConditionResolver,
} from '@sapience/sdk';
import type { ResolverType } from './types.js';

function collectAddresses(
  addressMap: Record<number, { address: Address; legacy?: readonly any[] }>,
  chainId: number
): Address[] {
  const entry = addressMap[chainId];
  if (!entry) return [];

  const addresses: Address[] = [entry.address];

  if (entry.legacy) {
    for (const leg of entry.legacy) {
      if (typeof leg === 'string') {
        addresses.push(leg as Address);
      } else if (leg && typeof leg === 'object' && 'address' in leg) {
        addresses.push((leg as { address: Address }).address);
      }
    }
  }

  return addresses;
}

/**
 * Returns a function that maps a resolver address to its type.
 * Case-insensitive matching.
 */
export function buildResolverClassifier(
  chainId: number
): (resolverAddress: string | null) => ResolverType {
  const map = new Map<string, ResolverType>();

  for (const addr of collectAddresses(
    conditionalTokensConditionResolver as any,
    chainId
  )) {
    map.set(addr.toLowerCase(), 'ct');
  }

  for (const addr of collectAddresses(
    pythConditionResolver as any,
    chainId
  )) {
    map.set(addr.toLowerCase(), 'pyth');
  }

  return (resolverAddress: string | null): ResolverType => {
    if (!resolverAddress) return 'unknown';
    return map.get(resolverAddress.toLowerCase()) ?? 'unknown';
  };
}
