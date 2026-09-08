import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';
import {
  fetchProtocolAnalytics,
  fetchProtocolStats,
  fetchVaultStats,
  fetchVaultAccountValue,
  type ProtocolAnalytics,
  type ProtocolAnalyticsStat,
  type VaultStat,
  type VaultAccountValue,
} from '~/lib/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

/**
 * Per-vault snapshot series from the `vault(address:).statsHistory`
 * surface. Backs the vault dashboard (VaultsPageContent, VaultPnlChart) — the
 * migration off the old `protocolStats(vaultAddress:)`.
 *
 * Returns an empty array (not undefined) when no address is provided so call
 * sites can read it unconditionally; `enabled` keeps the network call gated.
 */
export function useVaultStats(vaultAddress?: string) {
  const address = vaultAddress?.toLowerCase() ?? null;
  // Baseline for incremental refetches. Deliberately NOT read from the query
  // cache: a walk that died mid-flight covers only the newest pages, and
  // feeding that back as baseline would make the fetcher treat its missing
  // head as already-fetched — permanently truncating the series. Only a
  // COMPLETED walk's result is a valid baseline, so it lives in a ref set on
  // success, keyed by address so a vault switch can't leak the previous
  // vault's series.
  const lastComplete = useRef<{ address: string; stats: VaultStat[] } | null>(
    null
  );
  return useQuery<VaultStat[]>({
    queryKey: ['vaultStats', address],
    queryFn: async () => {
      if (!vaultAddress || !address) return [];
      // No `onProgress`: the fetcher walks pages newest-first, so streaming
      // partials in would repaint the chart once per page-batch — the axis
      // rescales, the x-domain stretches leftward and the whole path
      // re-lays-out several times before settling. One publish of the
      // complete series keeps the loader up a beat longer and lands the
      // chart in its final shape.
      const stats = await fetchVaultStats(vaultAddress, DEFAULT_CHAIN_ID, {
        // Seed interval refetches so they only pull the tail (one request)
        // instead of re-walking every page.
        baseline:
          lastComplete.current?.address === address
            ? lastComplete.current.stats
            : undefined,
      });
      lastComplete.current = { address, stats };
      return stats;
    },
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
 * Latest protocol stats only. Use this when callers need the live aggregate
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
 * Protocol analytics: live stats, the recorded snapshot series and both
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
} from '~/lib/sdk/queries';
