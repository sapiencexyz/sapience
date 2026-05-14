import { useQuery } from '@tanstack/react-query';
import {
  fetchOpenInterestByCategory,
  fetchOpenInterestByTimeToResolution,
  fetchProtocolStats,
  fetchVaultStats,
  type CategoryOpenInterest,
  type ProtocolStat,
  type TimeToResolutionBucket,
  type VaultStat,
} from '@sapience/sdk/queries';

// Protocol-wide analytics move slowly (snapshots are at-best hourly) and the
// queries are server-expensive, so we cache aggressively and don't refetch on
// tab focus — there's nothing the user can do about throttling, and the
// background polling already keeps the data fresh enough.
const CACHE_TIME_MS = 5 * 60 * 1000;

const ANALYTICS_QUERY_OPTS = {
  staleTime: CACHE_TIME_MS,
  refetchInterval: CACHE_TIME_MS,
  refetchOnWindowFocus: false,
} as const;

interface StatsWindow {
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}

const windowKey = (w?: StatsWindow): string =>
  `${w?.from == null ? '' : String(w.from)}|${w?.to == null ? '' : String(w.to)}`;

export function useProtocolStats(window?: StatsWindow) {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats', windowKey(window)],
    queryFn: () => fetchProtocolStats(window),
    ...ANALYTICS_QUERY_OPTS,
  });
}

export function useVaultStats(vaultAddress?: string, window?: StatsWindow) {
  const enabled = Boolean(vaultAddress && vaultAddress.trim() !== '');
  const addr = (vaultAddress || '').toLowerCase();
  return useQuery<VaultStat[]>({
    queryKey: ['vaultStats', addr, windowKey(window)],
    enabled,
    queryFn: () =>
      fetchVaultStats({
        vaultAddress: addr,
        from: window?.from,
        to: window?.to,
      }),
    ...ANALYTICS_QUERY_OPTS,
  });
}

export function useOpenInterestByCategory() {
  return useQuery<CategoryOpenInterest[]>({
    queryKey: ['openInterestByCategory'],
    queryFn: fetchOpenInterestByCategory,
    ...ANALYTICS_QUERY_OPTS,
  });
}

export function useOpenInterestByTimeToResolution() {
  return useQuery<TimeToResolutionBucket[]>({
    queryKey: ['openInterestByTimeToResolution'],
    queryFn: fetchOpenInterestByTimeToResolution,
    ...ANALYTICS_QUERY_OPTS,
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
 *
 * Splits across the two row types: `escrowBalance` is protocol-wide,
 * `availableAssets` is vault-specific, so the caller passes both.
 */
export function getProtocolTvlWei(
  protocolStat: Pick<ProtocolStat, 'escrowBalance'> | null | undefined,
  vaultStat: Pick<VaultStat, 'availableAssets'> | null | undefined
): bigint {
  return (
    BigInt(protocolStat?.escrowBalance || '0') +
    BigInt(vaultStat?.availableAssets || '0')
  );
}
