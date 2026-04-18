import { useQuery } from '@tanstack/react-query';
import { fetchProtocolStats, type ProtocolStat } from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats() {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats'],
    queryFn: fetchProtocolStats,
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolStat };

/**
 * Protocol TVL = open interest + undeployed vault funds (wei).
 * Matches the analytics-page definition; see AnalyticsResolver.protocolStats.
 */
export function getProtocolTvlWei(
  stat:
    | Pick<ProtocolStat, 'openInterest' | 'vaultAvailableAssets'>
    | null
    | undefined
): bigint {
  if (!stat) return 0n;
  return (
    BigInt(stat.openInterest || '0') + BigInt(stat.vaultAvailableAssets || '0')
  );
}
