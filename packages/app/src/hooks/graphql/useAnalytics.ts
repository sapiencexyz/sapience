import { useQuery } from '@tanstack/react-query';
import {
  fetchOpenInterestByCategory,
  fetchOpenInterestByTimeToResolution,
  fetchProtocolStats,
  fetchVaultStats,
  type CategoryOpenInterest,
  type ProtocolStat,
  type VaultStat,
  type TimeToResolutionBucket,
} from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats() {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats'],
    queryFn: fetchProtocolStats,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useVaultStats(vaultAddress: string | undefined) {
  return useQuery<VaultStat[]>({
    queryKey: ['vaultStats', vaultAddress?.toLowerCase() ?? null],
    queryFn: () => fetchVaultStats(vaultAddress as string),
    enabled: Boolean(vaultAddress),
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useOpenInterestByCategory() {
  return useQuery<CategoryOpenInterest[]>({
    queryKey: ['openInterestByCategory'],
    queryFn: fetchOpenInterestByCategory,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export function useOpenInterestByTimeToResolution() {
  return useQuery<TimeToResolutionBucket[]>({
    queryKey: ['openInterestByTimeToResolution'],
    queryFn: fetchOpenInterestByTimeToResolution,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type {
  CategoryOpenInterest,
  ProtocolStat,
  TimeToResolutionBucket,
  VaultStat,
};

/**
 * Protocol TVL = escrow balance + undeployed vault funds (wei).
 *
 * `escrowBalance` is the live on-chain collateral balance held by the current
 * and legacy escrow contracts, so it includes settled-but-unclaimed winnings.
 * Open interest drops the moment a condition settles, which is not what we
 * want TVL to reflect — funds haven't actually left the protocol until the
 * user redeems.
 */
export function getProtocolTvlWei(
  stat:
    | Pick<ProtocolStat, 'escrowBalance' | 'vaultAvailableAssets'>
    | null
    | undefined
): bigint {
  if (!stat) return 0n;
  return (
    BigInt(stat.escrowBalance || '0') + BigInt(stat.vaultAvailableAssets || '0')
  );
}
