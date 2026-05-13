import { useQuery } from '@tanstack/react-query';
import {
  fetchOpenInterestByCategory,
  fetchOpenInterestByTimeToResolution,
  fetchProtocolStats,
  type CategoryOpenInterest,
  type ProtocolStat,
  type TimeToResolutionBucket,
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

export function useProtocolStats(vaultAddress?: string) {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats', vaultAddress?.toLowerCase() ?? null],
    queryFn: () => fetchProtocolStats(vaultAddress),
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

export type { CategoryOpenInterest, ProtocolStat, TimeToResolutionBucket };

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
