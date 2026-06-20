import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  fetchProtocolAnalytics,
  fetchProtocolStats,
  fetchVaultStats,
  fetchVaultAccountValue,
  type ProtocolAnalytics,
  type ProtocolAnalyticsStat,
  type VaultStat,
  type VaultAccountValue,
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
 * Coherent indexed vault account value for the /vaults amount display.
 * Uses one GraphQL account view instead of mixing live contract reads with
 * cached vault stats snapshots.
 */
export function useVaultAccountValue(vaultAddress?: string) {
  return useQuery<VaultAccountValue>({
    queryKey: ['vaultAccountValue', vaultAddress?.toLowerCase() ?? null],
    queryFn: () =>
      vaultAddress
        ? fetchVaultAccountValue(vaultAddress, DEFAULT_CHAIN_ID)
        : Promise.resolve({
            collateralBalance: '0',
            deployedCollateral: '0',
            claimableCollateral: '0',
            totalValue: '0',
            timestamp: null,
          }),
    enabled: !!vaultAddress,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

/**
 * Latest v2 protocol stats only. Use this when callers need the live aggregate
 * numbers without the heavier history/open-interest analytics payload.
 */
export function useProtocolStats() {
  return useQuery<ProtocolAnalyticsStat>({
    queryKey: ['protocolStats'],
    queryFn: () => fetchProtocolStats(),
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

export type { ProtocolAnalytics, VaultStat, VaultAccountValue };
export type {
  ProtocolAnalyticsStat,
  ProtocolCategoryOpenInterest,
  ProtocolTimeToResolutionBucket,
} from '@sapience/sdk/queries';
