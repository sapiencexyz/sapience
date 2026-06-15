import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  fetchProtocolAnalytics,
  fetchVaultStats,
  type ProtocolAnalytics,
  type VaultStat,
} from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

/**
 * Per-vault snapshot series from the v2 `vault(address:).statsHistory`
 * surface. Backs the vault dashboard (VaultsPageContent, VaultPnlChart) — the
 * migration off v1's `protocolStats(vaultAddress:)`.
 *
 * Returns an empty array (not undefined) when no address is provided so call
 * sites can read it unconditionally; `enabled` keeps the network call gated.
 */
export function useVaultStats(vaultAddress?: string) {
  return useQuery<VaultStat[]>({
    queryKey: ['vaultStats', vaultAddress?.toLowerCase() ?? null],
    queryFn: () =>
      vaultAddress
        ? fetchVaultStats(vaultAddress, DEFAULT_CHAIN_ID)
        : Promise.resolve([]),
    enabled: !!vaultAddress,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

/**
 * v2 protocol analytics: live stats, the recorded snapshot series and both
 * open-interest breakdowns in a single `protocol { ... }` query.
 */
export function useProtocolAnalytics() {
  return useQuery<ProtocolAnalytics>({
    queryKey: ['protocolAnalytics'],
    queryFn: () => fetchProtocolAnalytics(),
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolAnalytics, VaultStat };
export type {
  ProtocolAnalyticsStat,
  ProtocolCategoryOpenInterest,
  ProtocolTimeToResolutionBucket,
} from '@sapience/sdk/queries';
