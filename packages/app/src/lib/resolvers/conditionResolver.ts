import { CHAIN_ID_ARBITRUM, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  lzPMResolver,
  lzUmaResolver,
  umaResolver,
  pythResolver,
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

export type ResolverKind = 'lzPM' | 'lzUma' | 'uma' | 'pyth' | 'unknown';

export function inferResolverKind(
  resolverAddress?: string | null
): ResolverKind {
  const addr = normalizeAddress(resolverAddress);
  if (!addr) return 'unknown';
  if (findChainIdForAddress(addr, lzPMResolver as any) != null) return 'lzPM';
  if (findChainIdForAddress(addr, lzUmaResolver as any) != null) return 'lzUma';
  if (findChainIdForAddress(addr, umaResolver as any) != null) return 'uma';
  if (findChainIdForAddress(addr, pythResolver as any) != null) return 'pyth';
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

  const lzPmChain = findChainIdForAddress(addr, lzPMResolver as any);
  if (lzPmChain != null) return lzPmChain;

  const pythChain = findChainIdForAddress(addr, pythResolver as any);
  if (pythChain != null) return pythChain;

  const lzUmaChain = findChainIdForAddress(addr, lzUmaResolver as any);
  if (lzUmaChain != null) return lzUmaChain;

  const umaChain = findChainIdForAddress(addr, umaResolver as any);
  if (umaChain != null) return umaChain;

  // Unknown resolver → follow app default.
  return DEFAULT_CHAIN_ID;
}

/**
 * For question URLs / display: prefer the condition's resolver when present,
 * otherwise use the chain's default resolver mapping.
 */
export function getConditionResolverAddress(opts: {
  conditionResolver?: string | null;
  conditionChainId?: number | null;
}): Address | undefined {
  const fromCondition = normalizeAddress(
    opts.conditionResolver
  ) as Address | null;
  if (fromCondition) return fromCondition;
  const chainId = opts.conditionChainId ?? DEFAULT_CHAIN_ID;
  return (
    (lzPMResolver as any)[chainId]?.address ??
    (lzUmaResolver as any)[chainId]?.address ??
    (umaResolver as any)[chainId]?.address ??
    (pythResolver as any)[chainId]?.address
  );
}

/**
 * Admin exception: "bridged" resolution should be settled on Arbitrum.
 *
 * Today we treat any LayerZero PM resolver (Ethereal) as bridged → settle via Arbitrum lzUmaResolver.
 */
export function getAdminSettlementTarget(opts: {
  conditionResolver?: string | null;
}): { chainId: number; resolverAddress: Address } | null {
  const kind = inferResolverKind(opts.conditionResolver);
  if (kind === 'pyth') return null;

  if (kind === 'lzPM') {
    const arb = (lzUmaResolver as any)[CHAIN_ID_ARBITRUM]?.address as
      | Address
      | undefined;
    return arb ? { chainId: CHAIN_ID_ARBITRUM, resolverAddress: arb } : null;
  }

  // If already UMA/lzUma, settle on Arbitrum (forecasting/EAS chain).
  if (kind === 'lzUma' || kind === 'uma') {
    const arb = (lzUmaResolver as any)[CHAIN_ID_ARBITRUM]?.address as
      | Address
      | undefined;
    return arb ? { chainId: CHAIN_ID_ARBITRUM, resolverAddress: arb } : null;
  }

  // Unknown → default to Ethereal (non-forecasting), but admin settlement likely should not guess.
  return null;
}
