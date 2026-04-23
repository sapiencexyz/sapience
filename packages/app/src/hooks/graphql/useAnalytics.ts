import { useQuery } from '@tanstack/react-query';
import { fetchProtocolStats, type ProtocolStat } from '@sapience/sdk/queries';

const CACHE_TIME_MS = 60 * 1000;

export function useProtocolStats(vaultAddress?: string) {
  return useQuery<ProtocolStat[]>({
    queryKey: ['protocolStats', vaultAddress?.toLowerCase() ?? null],
    queryFn: () => fetchProtocolStats(vaultAddress),
    staleTime: CACHE_TIME_MS,
    refetchInterval: CACHE_TIME_MS,
  });
}

export type { ProtocolStat };

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
